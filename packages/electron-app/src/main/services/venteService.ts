import { stock as domainStock, invoicing as domainInvoicing, vendeur as domainVendeur, pricing as domainPricing } from "@maxi-equip/domain";
import type { LigneFacture, LigneReleveInterne } from "@maxi-equip/shared-types";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { PromotionRepository } from "../repositories/promotionRepository.js";
import { ParametresRepository } from "../repositories/parametresRepository.js";
import { ValidationStockDistanteService, erreurDepuisEchecValidationDistante, compenserApresEchecLocal } from "./validationStockDistanteService.js";

export class VenteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VenteValidationError";
  }
}

/** Quantité explicitement prélevée sur un dépôt donné (Akébé ou Akanda) pour une ligne de vente. */
export interface AllocationDepot {
  emplacementId: string;
  quantite: number;
}

export interface VenteLigneInput {
  produitId: string;
  /** Quantité totale demandée par le client pour cette ligne. */
  quantite: number;
  prixUnitaire: number;
  /**
   * Répartition explicite entre les dépôts réels (Akébé/Akanda) —
   * correction Phase 2 : une vente peut prélever sur un seul dépôt, sur
   * les deux, ou sur aucun (entièrement externe). La somme de ces
   * allocations ne doit jamais dépasser `quantite`.
   */
  allocationsDepots: AllocationDepot[];
  /** Renseignés uniquement si la somme des allocations ne couvre pas `quantite` (le reste est externe). */
  fournisseurExterne?: string;
  prixAchatExterne?: number;
}

export interface VenteInput {
  /** Point de vente (SHOP) — sert uniquement à l'enregistrement de la facture, jamais à une vérification de stock (SHOP n'a pas de stock). */
  pointDeVenteId: string;
  clientNom: string;
  /**
   * Correction "Rendre le numéro de téléphone facultatif" (2026-10-21) :
   * `null`/vide désormais accepté (comportement historique : obligatoire).
   * Quand un numéro EST renseigné, son format reste validé (voir
   * enregistrerVente) — jamais un numéro invalide accepté silencieusement.
   */
  clientTelephone: string | null;
  clientAdresse: string | null;
  vendeurUtilisateurId: string;
  vendeurCompteConnecteNom: string;
  vendeurNomManuel: string | null;
  modeReglement: string | null;
  lignes: VenteLigneInput[];
  /**
   * Remise commerciale exceptionnelle sur CETTE vente, en FCFA — correction
   * "Remise / Négociation". Jamais optionnel : l'appelant doit toujours
   * trancher explicitement (0 si aucune remise). Validée dans
   * `enregistrerVente` via `domainInvoicing.validerRemise` — jamais une
   * seconde règle de validation réinventée ici.
   */
  remise: number;
  /**
   * Statut de paiement — correction "Réservation / Acompte". OPTIONNEL,
   * contrairement à `remise` : la quasi-totalité des ventes sont
   * intégralement payées, donc omis = `"payee"` (voir `enregistrerVente`).
   * Seul un appelant qui enregistre explicitement une réservation doit le
   * renseigner — jamais besoin de toucher les très nombreux sites d'appel
   * existants (tests, maintenance) pour le cas normal.
   */
  statutPaiement?: "reservation" | "payee";
  /**
   * Acompte versé — pertinent UNIQUEMENT si `statutPaiement === "reservation"`
   * (sinon ignoré : `enregistrerVente` calcule lui-même le montant payé
   * comme le total net pour une vente "payee", jamais une valeur à
   * deviner côté appelant). Validé via `domainInvoicing.validerMontantPaye`.
   */
  montantPaye?: number;
}

export interface VenteResult {
  factureId: string;
  numero: string;
  total: number;
  remise: number;
}

/** Les 3 statuts affichés à l'écran Factures — voir FacturesScreen.tsx. Traduits en statutPaiement/statutLivraison par VenteService.changerStatutFacture. */
export type StatutFactureAffiche = "reservation" | "payee_non_livree" | "payee_livree";

/**
 * Orchestre une vente. AUCUNE règle métier n'est réimplémentée ici :
 * - la vérification de disponibilité PAR DÉPÔT vient de
 *   domainStock.applySortie (déjà existante — aucune nouvelle règle
 *   n'a été ajoutée au domaine pour ce correctif) ;
 * - la fusion en une seule ligne facture vient de domainInvoicing.buildLigneFacture ;
 * - le relevé interne vient de domainInvoicing.buildLignesReleveInterne ;
 * - le total vient de domainInvoicing.calculerTotalFacture ;
 * - le vendeur effectif vient de domainVendeur.resolveVendeurEffectif.
 *
 * Une ligne de vente peut désormais prélever sur PLUSIEURS dépôts à la
 * fois (Akébé + Akanda), chaque allocation étant validée et déduite
 * indépendamment via applySortie — une allocation qui dépasse le stock
 * réel de SON dépôt échoue immédiatement (InsufficientStockError),
 * jamais un dépassement silencieux compensé par l'autre dépôt. Le reliquat
 * non couvert par les dépôts devient la part externe.
 *
 * Chaque dépôt réellement utilisé génère son propre mouvement de sortie,
 * tous liés à la même facture — la vente reste UNE facture côté client,
 * mais plusieurs mouvements traçables en interne (§11/§13 de la
 * correction).
 */
export class VenteService {
  constructor(
    private readonly db: import("better-sqlite3-multiple-ciphers").Database,
    private readonly produitRepository: ProduitRepository,
    private readonly stockRepository: StockRepository,
    private readonly mouvementRepository: MouvementRepository,
    private readonly factureRepository: FactureRepository,
    private readonly boiteEnvoiRepository: BoiteEnvoiRepository,
    private readonly promotionRepository?: PromotionRepository,
    /**
     * Correction Phase Finale, Bloc 6 — optionnel pour ne jamais casser un
     * site d'appel existant (tests) qui construirait ce service sans
     * dépôt paramètres. Sans lui, `identiteSnapshot` reste `null` (comme
     * pour une facture antérieure à cette évolution) — jamais une
     * exception, jamais un comportement dégradé silencieusement différent.
     */
    private readonly parametresRepository?: ParametresRepository,
    /**
     * Correction "travailler en parallèle sur le même stock" (2026-10-22) —
     * OPTIONNEL pour ne jamais casser un site d'appel existant (tests) qui
     * construirait ce service sans lui : absent ou non configuré (voir
     * `estConfiguree()`), le comportement reste 100% local et inchangé
     * (stock ET numéro de facture décidés localement, comme avant). Présent
     * ET configuré, ni le stock ni le numéro de facture ne sont plus
     * décidés localement — seul le serveur central tranche, dans une seule
     * transaction (décision utilisateur explicite).
     */
    private readonly validationStockDistanteService?: ValidationStockDistanteService
  ) {}

  async enregistrerVente(input: VenteInput): Promise<VenteResult> {
    if (input.lignes.length === 0) {
      throw new VenteValidationError("Une vente doit contenir au moins une ligne.");
    }
    // Correction "Rendre le numéro de téléphone facultatif" (2026-10-21) :
    // un numéro absent/vide est désormais accepté — seul un numéro
    // RENSEIGNÉ doit respecter un format valide (même expression que
    // VentesScreen.tsx/validerTelephone, jamais une seconde règle qui
    // pourrait diverger).
    if (input.clientTelephone && input.clientTelephone.trim().length > 0 && !/^[0-9+()\s-]{6,}$/.test(input.clientTelephone.trim())) {
      throw new VenteValidationError("Le numéro de téléphone du client, s'il est renseigné, doit être valide.");
    }
    // Normalisé une seule fois ici — "" et null signifient la même chose
    // ("aucun numéro"), jamais stockés différemment selon l'appelant.
    const clientTelephoneNormalise = input.clientTelephone && input.clientTelephone.trim().length > 0 ? input.clientTelephone.trim() : null;

    // Correction "travailler en parallèle sur le même stock" (2026-10-22) —
    // appel réseau fait AVANT d'ouvrir la transaction locale (synchrone,
    // incompatible avec un `await` en son sein). Lecture seule : les mêmes
    // vérifications de forme (produit introuvable...) sont de toute façon
    // refaites à l'identique dans la transaction ci-dessous, qui reste la
    // seule source de vérité pour construire réellement la facture.
    let stockApresServeur: { produitId: string; emplacementId: string; quantite: number }[] | null = null;
    let numeroServeur: string | undefined;
    // Correction "vente décrémentée sans facture générée" (2026-10-27) —
    // conservés hors du bloc ci-dessous pour pouvoir compenser (voir
    // compenserApresEchecLocal) si la transaction locale plus bas échoue
    // APRÈS que ce commit serveur ait déjà eu lieu.
    let deltasValidesEnLigne: { produitId: string; emplacementId: string; delta: number }[] = [];
    if (this.validationStockDistanteService?.estConfiguree()) {
      const deltas: { produitId: string; emplacementId: string; delta: number }[] = [];
      for (const ligne of input.lignes) {
        const produit = this.produitRepository.findById(ligne.produitId);
        if (!produit) throw new VenteValidationError(`Produit introuvable (${ligne.produitId}).`);
        for (const allocation of ligne.allocationsDepots.filter((a) => a.quantite > 0)) {
          deltas.push({ produitId: produit.id, emplacementId: allocation.emplacementId, delta: -allocation.quantite });
        }
      }
      if (deltas.length > 0) {
        const resultat = await this.validationStockDistanteService.valider(deltas, { prefix: this.factureRepository.prefixNumeroCourant() });
        if (!resultat.success) throw erreurDepuisEchecValidationDistante(resultat);
        stockApresServeur = resultat.stockApres;
        numeroServeur = resultat.numero;
        deltasValidesEnLigne = deltas;
      }
    }

    const executer = this.db.transaction(() => {
      const lignesFacture: LigneFacture[] = [];
      const lignesReleveInterne: LigneReleveInterne[] = [];
      const mouvementsAEnregistrer: { produitId: string; emplacementId: string | null; quantite: number; note: string | null }[] = [];

      for (const ligne of input.lignes) {
        const produit = this.produitRepository.findById(ligne.produitId);
        if (!produit) {
          throw new VenteValidationError(`Produit introuvable (${ligne.produitId}).`);
        }
        // Ferme un trou de validation identifié : une quantité totale
        // négative ou nulle, combinée à une répartition par dépôt vide,
        // devenait directement une "part externe" sans jamais passer par
        // une vérification de disponibilité (§7/§8 de la correction —
        // "empêcher qu'une quantité négative puisse entrer dans la
        // logique métier par un autre chemin").
        if (!Number.isFinite(ligne.quantite) || ligne.quantite <= 0) {
          throw new VenteValidationError(`Quantité invalide pour "${produit.motif} ${produit.taille}" (reçu : ${ligne.quantite}).`);
        }
        if (!Number.isFinite(ligne.prixUnitaire) || ligne.prixUnitaire <= 0) {
          throw new VenteValidationError(`Prix unitaire invalide pour "${produit.motif} ${produit.taille}" (reçu : ${ligne.prixUnitaire}).`);
        }

        const allocationsValides = ligne.allocationsDepots.filter((a) => a.quantite > 0);
        const quantiteAllouee = allocationsValides.reduce((s, a) => s + a.quantite, 0);
        if (quantiteAllouee > ligne.quantite) {
          throw new VenteValidationError(
            `La répartition entre dépôts (${quantiteAllouee}) dépasse la quantité demandée (${ligne.quantite}) pour "${produit.motif} ${produit.taille}".`
          );
        }

        // Chaque dépôt est validé et déduit INDÉPENDAMMENT — une
        // allocation qui dépasse le stock réel de SON dépôt échoue
        // immédiatement, jamais compensée silencieusement par l'autre
        // dépôt (§6/§7 de la correction : l'utilisateur répartit
        // explicitement, le système ne devine pas).
        for (const allocation of allocationsValides) {
          // Correction "travailler en parallèle sur le même stock"
          // (2026-10-22) : quand le serveur central a déjà validé la
          // demande (stockApresServeur non null), le stock local n'est
          // JAMAIS revérifié ni déduit ici — il serait potentiellement
          // périmé (une autre machine a pu vendre entre-temps). Il est
          // fixé plus bas, une seule fois, aux valeurs exactes renvoyées
          // par le serveur (voir stockApresServeur plus loin).
          if (!stockApresServeur) {
            const disponible = this.stockRepository.getQuantite(produit.id, allocation.emplacementId);
            const delta = domainStock.applySortie(allocation.emplacementId, disponible, allocation.quantite);
            this.stockRepository.applyDelta({ ...delta, produitId: produit.id });
          }
          mouvementsAEnregistrer.push({ produitId: produit.id, emplacementId: allocation.emplacementId, quantite: allocation.quantite, note: null });
        }

        const quantiteExterne = ligne.quantite - quantiteAllouee;
        if (quantiteExterne > 0 && (!ligne.fournisseurExterne || ligne.prixAchatExterne === undefined)) {
          throw new VenteValidationError(
            `Répartition incomplète pour "${produit.motif} ${produit.taille}" (${quantiteAllouee}/${ligne.quantite} couvert par les dépôts) — fournisseur et coût d'achat externes requis pour le complément.`
          );
        }
        if (quantiteExterne > 0) {
          // BUG CORRIGÉ : une vente entièrement (ou partiellement) couverte
          // par un fournisseur externe ne créait auparavant AUCUNE trace
          // dans les mouvements — l'Historique n'affichant que des
          // mouvements, une vente 100% externe y était invisible pour
          // TOUT LE MONDE (jamais un problème de rôle : reproduit et
          // confirmé en relisant le code, aucun filtrage par rôle
          // n'existe dans ce service ni dans les requêtes de lecture).
          // `emplacementId: null` — aucun dépôt réel n'est concerné,
          // jamais de déduction de stock ici, uniquement une trace.
          mouvementsAEnregistrer.push({
            produitId: produit.id,
            emplacementId: null,
            quantite: quantiteExterne,
            note: `Approvisionnement externe (${ligne.fournisseurExterne})`,
          });
        }

        // Promotion : déterminer si une promotion est active pour ce produit
        // au moment exact de la validation (jamais au moment de la création de
        // la demande, ni à l'ouverture de l'écran Vente).
        let promotionInfo: { promotionId: string | null; promotionLibelle: string | null; promotionType: string | null; promotionValeur: number | null; prixUnitaireNormal: number | null } =
          { promotionId: null, promotionLibelle: null, promotionType: null, promotionValeur: null, prixUnitaireNormal: null };

        if (this.promotionRepository) {
          const promoActives = this.promotionRepository.listActivesParProduit(produit.id);
          const effectif = domainPricing.getEffectivePrice({ prix: produit.prix }, promoActives);
          if (effectif.isPromoActive && effectif.promotionId) {
            const promo = promoActives.find((p) => p.id === effectif.promotionId);
            if (promo) {
              promotionInfo = {
                promotionId: promo.id,
                promotionLibelle: promo.libelle,
                promotionType: promo.typeReduction,
                promotionValeur: promo.valeur,
                prixUnitaireNormal: produit.prix,
              };
            }
          }
        }

        // Surface du carton — snapshot au moment de la vente (voir
        // shared-types/facture.ts), calculée UNIQUEMENT si les trois
        // informations nécessaires sont renseignées pour ce produit ;
        // `null` sinon, jamais une valeur inventée (produit créé avant
        // cette correction, ou carreauxParCarton pas encore saisi).
        const surfaceCartonM2 =
          produit.carreauxParCarton && produit.largeur && produit.hauteur
            ? domainPricing.calculerSurfaceCartonM2(produit.carreauxParCarton, produit.largeur, produit.hauteur)
            : null;

        const ligneFacture = domainInvoicing.buildLigneFacture({
          produitId: produit.id,
          motif: produit.motif,
          reference: produit.reference,
          taille: produit.taille,
          prixUnitaire: ligne.prixUnitaire,
          quantiteInterne: quantiteAllouee,
          quantiteExterne,
          fournisseur: ligne.fournisseurExterne,
          prixAchatExterne: ligne.prixAchatExterne,
          surfaceCartonM2,
          ...promotionInfo,
        });
        lignesFacture.push(ligneFacture);

        const releve = domainInvoicing.buildLignesReleveInterne([
          {
            produitId: produit.id,
            motif: produit.motif,
            reference: produit.reference,
            taille: produit.taille,
            prixUnitaire: ligne.prixUnitaire,
            quantiteInterne: quantiteAllouee,
            quantiteExterne,
            fournisseur: ligne.fournisseurExterne,
            prixAchatExterne: ligne.prixAchatExterne,
          },
        ]);
        lignesReleveInterne.push(...releve);
      }

      // Correction "travailler en parallèle sur le même stock" (2026-10-22) :
      // une seule écriture, aux valeurs EXACTES renvoyées par le serveur
      // central (jamais recalculée localement) — fixe aussi, au passage,
      // un stock local qui aurait pu dériver avant cette vente.
      if (stockApresServeur) {
        for (const s of stockApresServeur) this.stockRepository.setQuantite(s.produitId, s.emplacementId, s.quantite);
      }

      const total = domainInvoicing.calculerTotalFacture(lignesFacture);
      try {
        domainInvoicing.validerRemise(input.remise, total);
      } catch (err) {
        if (err instanceof domainInvoicing.InvalidRemiseError) throw new VenteValidationError(err.message);
        throw err;
      }
      // "payee" (le cas normal, par défaut) : le montant payé est
      // TOUJOURS le total net lui-même — jamais une valeur fournie par
      // l'appelant à faire correspondre, ce qui éviterait toute dérive.
      // Seule une "reservation" explicite fournit un acompte distinct.
      const totalNet = domainInvoicing.calculerTotalNet(total, input.remise);
      const statutPaiement = input.statutPaiement ?? "payee";
      const montantPaye = statutPaiement === "payee" ? totalNet : (input.montantPaye ?? 0);
      try {
        domainInvoicing.validerMontantPaye(statutPaiement, montantPaye, totalNet);
      } catch (err) {
        if (err instanceof domainInvoicing.InvalidMontantPayeError) throw new VenteValidationError(err.message);
        throw err;
      }
      const vendeurEffectif = domainVendeur.resolveVendeurEffectif({
        compteConnecteNom: input.vendeurCompteConnecteNom,
        vendeurNomManuel: input.vendeurNomManuel,
      });

      // Correction "travail à distance / plusieurs machines en parallèle"
      // (2026-10-22) : attribué par le serveur central dès qu'il a validé
      // le stock (même transaction, voir plus haut) — jamais recalculé
      // localement dans ce cas, pour garantir qu'il est unique entre
      // toutes les machines, pas seulement sur ce poste.
      const numero = numeroServeur ?? this.factureRepository.nextNumero();
      const now = new Date().toISOString();
      // Correction Phase Finale, Bloc 6 — capture RÉELLE de l'identité
      // entreprise à l'instant de la vente, jamais relue en direct plus
      // tard pour cette facture (voir factureDocumentService via
      // ipc/metier.ts, qui utilise ce snapshot en priorité).
      const identite = this.parametresRepository?.getIdentite() ?? null;
      const identiteSnapshot = identite
        ? {
            nom: identite.nom,
            adresse: identite.adresse,
            quartier: identite.quartier,
            telephones: identite.telephones,
            nomAdministrateur: identite.nomAdministrateur,
            nomGerant: identite.nomGerant,
          }
        : null;
      const factureId = this.factureRepository.create({
        numero,
        date: now,
        // Le point de vente (SHOP) — jamais un dépôt : une vente peut
        // désormais provenir de deux dépôts à la fois, ce champ ne peut
        // donc plus représenter "le" dépôt utilisé (correction Phase 2).
        emplacementId: input.pointDeVenteId,
        clientNom: input.clientNom,
        clientTelephone: clientTelephoneNormalise,
        clientAdresse: input.clientAdresse,
        vendeurUtilisateurId: input.vendeurUtilisateurId,
        vendeurNomManuel: vendeurEffectif.estPrecisionManuelle ? input.vendeurNomManuel : null,
        modeReglement: input.modeReglement,
        lignes: lignesFacture,
        total,
        remise: input.remise,
        statutPaiement,
        montantPaye,
        identiteSnapshot,
      });

      this.factureRepository.createReleveInterne(factureId, lignesReleveInterne);

      const mouvementIds: string[] = [];
      for (const m of mouvementsAEnregistrer) {
        const mouvementId = this.mouvementRepository.create({
          type: "sortie",
          produitId: m.produitId,
          emplacementId: m.emplacementId,
          emplacementSourceId: null,
          emplacementDestinationId: null,
          quantite: m.quantite,
          date: now,
          factureId,
          utilisateurId: input.vendeurUtilisateurId,
          note: m.note,
        });
        mouvementIds.push(mouvementId);
      }

      // Boîte d'envoi (Phase 3.3) : ajoutée DANS la même transaction que
      // la vente elle-même — jamais un ajout séparé qui pourrait laisser
      // une facture enregistrée sans son entrée d'envoi (ou l'inverse) si
      // une étape échouait entre les deux (§6 de la correction). Payload
      // volontairement limité aux champs métier utiles à une future
      // synchronisation — jamais un instantané de toute la base (§3).
      //
      // Correction "visibilité croisée Factures/Historique entre postes"
      // (2026-10-27), Phase 3 — `emplacementId`/`identiteSnapshot`/
      // `vendeurNomManuel` ajoutés (additif, jamais un changement du
      // format existant) : sans `emplacementId`, une facture reçue d'un
      // autre poste ne pourrait jamais s'insérer localement
      // (`factures.emplacement_id` est NOT NULL) ; sans
      // `identiteSnapshot`, son PDF ne pourrait pas être régénéré
      // correctement sur un poste dont l'identité entreprise diffère.
      this.boiteEnvoiRepository.creer("vente", factureId, {
        factureId,
        numero,
        date: now,
        emplacementId: input.pointDeVenteId,
        clientNom: input.clientNom,
        clientTelephone: clientTelephoneNormalise,
        clientAdresse: input.clientAdresse,
        vendeurUtilisateurId: input.vendeurUtilisateurId,
        vendeurNomManuel: vendeurEffectif.estPrecisionManuelle ? input.vendeurNomManuel : null,
        modeReglement: input.modeReglement,
        total,
        remise: input.remise,
        statutPaiement,
        montantPaye,
        lignes: lignesFacture,
        mouvementIds,
        identiteSnapshot,
      });

      return { factureId, numero, total, remise: input.remise };
    });

    try {
      return executer();
    } catch (err) {
      // Correction "vente décrémentée sans facture générée" (2026-10-27)
      // — voir compenserApresEchecLocal. L'erreur d'origine (celle que
      // l'utilisateur doit voir) est TOUJOURS relancée telle quelle après
      // la tentative de compensation, jamais masquée par elle.
      if (this.validationStockDistanteService) {
        await compenserApresEchecLocal(this.validationStockDistanteService, deltasValidesEnLigne);
      }
      throw err;
    }
  }

  /**
   * Change le statut affiché d'une facture (§ correction "Réservation /
   * Acompte") — seul point d'entrée pour cette opération, traduit vers
   * `factureRepository.changerStatut()`. Librement réversible entre
   * "payee_non_livree" et "payee_livree" dans les deux sens (aucun verrou
   * "terminus" — décision explicite). Le retour vers "reservation" n'est
   * accepté que si la facture y est DÉJÀ (no-op) : une fois le solde
   * encaissé, impossible de "redevenir" une réservation — il n'existe
   * aucun mécanisme pour rendre l'argent déjà reçu.
   */
  changerStatutFacture(factureId: string, nouveauStatut: StatutFactureAffiche): void {
    const facture = this.factureRepository.findById(factureId);
    if (!facture) {
      throw new VenteValidationError("Facture introuvable.");
    }
    if (facture.annuleeLe) {
      throw new VenteValidationError("Impossible de changer le statut d'une facture annulée.");
    }

    if (nouveauStatut === "reservation") {
      if (facture.statutPaiement !== "reservation") {
        throw new VenteValidationError("Impossible de repasser une facture déjà payée en réservation.");
      }
      return;
    }

    // Passer à "payee_non_livree" ou "payee_livree" encaisse automatiquement
    // le solde restant s'il s'agissait d'une réservation — le CGV impose un
    // paiement intégral avant livraison, jamais de livraison partiellement payée.
    const totalNet = domainInvoicing.calculerTotalNet(facture.total, facture.remise);
    this.factureRepository.changerStatut(factureId, {
      statutPaiement: "payee",
      montantPaye: totalNet,
      statutLivraison: nouveauStatut === "payee_livree" ? "livree" : "en_attente",
    });
  }

  /**
   * Annule une vente/facture (§5/§6/§21 de la correction) : suppression
   * douce de la facture (jamais physique — reste consultable via
   * l'historique avec son motif), restauration du stock réellement
   * prélevé sur les dépôts. Aucune restauration pour la part externe
   * (`emplacementId: null`) — rien n'avait été ajouté au stock MAXI EQUIP
   * pour cette part, il n'y a donc rien à restaurer (§9 : "les 100
   * provenant de l'extérieur ne deviennent jamais stock MAXI EQUIP").
   *
   * La restauration elle-même est enregistrée comme un mouvement
   * d'entrée traçable, rattaché à la même facture — visible dans
   * l'Historique, cohérent avec l'exigence de traçabilité (§16).
   */
  async annulerVente(factureId: string, motif: string, annuleePar: string): Promise<void> {
    if (!motif || motif.trim().length === 0) {
      throw new VenteValidationError("Un motif d'annulation est requis.");
    }

    // Correction "travailler en parallèle sur le même stock" (2026-10-22) :
    // une vente validée en ligne a décrémenté le stock CENTRAL — l'annuler
    // doit donc le restaurer au MÊME endroit, jamais seulement en local
    // (sinon le stock central reste décrémenté pour toujours après une
    // annulation, divergence permanente avec le stock réellement
    // disponible). Lecture seule ici, avant la transaction locale.
    let stockApresServeur: { produitId: string; emplacementId: string; quantite: number }[] | null = null;
    // Correction "vente décrémentée sans facture générée" (2026-10-27) —
    // mêmes raisons que dans enregistrerVente ci-dessus.
    let deltasValidesEnLigne: { produitId: string; emplacementId: string; delta: number }[] = [];
    if (this.validationStockDistanteService?.estConfiguree()) {
      const factureAvantTransaction = this.factureRepository.findById(factureId);
      if (!factureAvantTransaction) throw new VenteValidationError("Facture introuvable.");
      if (factureAvantTransaction.annuleeLe) throw new VenteValidationError("Cette facture est déjà annulée.");
      const mouvementsAvantTransaction = this.mouvementRepository.listParFacture(factureId);
      const deltas = mouvementsAvantTransaction
        .filter((m) => m.type === "sortie" && m.emplacementId)
        .map((m) => ({ produitId: m.produitId, emplacementId: m.emplacementId!, delta: m.quantite }));
      if (deltas.length > 0) {
        const resultat = await this.validationStockDistanteService.valider(deltas);
        if (!resultat.success) throw erreurDepuisEchecValidationDistante(resultat);
        stockApresServeur = resultat.stockApres;
        deltasValidesEnLigne = deltas;
      }
    }

    const executer = this.db.transaction(() => {
      const facture = this.factureRepository.findById(factureId);
      if (!facture) {
        throw new VenteValidationError("Facture introuvable.");
      }
      if (facture.annuleeLe) {
        throw new VenteValidationError("Cette facture est déjà annulée.");
      }

      const mouvements = this.mouvementRepository.listParFacture(factureId);
      const now = new Date().toISOString();

      if (stockApresServeur) {
        for (const s of stockApresServeur) this.stockRepository.setQuantite(s.produitId, s.emplacementId, s.quantite);
      }

      for (const m of mouvements) {
        if (m.type !== "sortie" || !m.emplacementId) continue; // rien à restaurer pour la part externe
        if (!stockApresServeur) {
          const delta = domainStock.applyEntree(m.emplacementId, m.quantite);
          this.stockRepository.applyDelta({ ...delta, produitId: m.produitId });
        }
        this.mouvementRepository.create({
          type: "entree",
          produitId: m.produitId,
          emplacementId: m.emplacementId,
          emplacementSourceId: null,
          emplacementDestinationId: null,
          quantite: m.quantite,
          date: now,
          factureId,
          utilisateurId: annuleePar,
          note: `Restauration suite à l'annulation de la facture ${facture.numero}`,
        });
      }

      this.factureRepository.annuler(factureId, motif.trim(), annuleePar);

      // Boîte d'envoi (Phase 3.3) : l'annulation est une opération
      // métier critique à part entière (§5 de la correction), avec son
      // propre entity_id — jamais fusionnée avec l'entrée "vente"
      // d'origine, qui reste un événement distinct et déjà envoyé.
      this.boiteEnvoiRepository.creer("annulation", factureId, {
        factureId,
        numero: facture.numero,
        motifAnnulation: motif.trim(),
        annuleeLe: now,
        annuleePar,
      });
    });

    try {
      executer();
    } catch (err) {
      // Correction "vente décrémentée sans facture générée" (2026-10-27)
      // — voir compenserApresEchecLocal.
      if (this.validationStockDistanteService) {
        await compenserApresEchecLocal(this.validationStockDistanteService, deltasValidesEnLigne);
      }
      throw err;
    }
  }
}
