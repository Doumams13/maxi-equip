import { stock as domainStock, invoicing as domainInvoicing, vendeur as domainVendeur } from "@maxi-equip/domain";
import type { LigneFacture, LigneReleveInterne } from "@maxi-equip/shared-types";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { ProduitRepository } from "../repositories/produitRepository.js";

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
  clientTelephone: string;
  clientAdresse: string | null;
  vendeurUtilisateurId: string;
  vendeurCompteConnecteNom: string;
  vendeurNomManuel: string | null;
  modeReglement: string | null;
  lignes: VenteLigneInput[];
}

export interface VenteResult {
  factureId: string;
  numero: string;
  total: number;
}

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
    private readonly factureRepository: FactureRepository
  ) {}

  enregistrerVente(input: VenteInput): VenteResult {
    if (input.lignes.length === 0) {
      throw new VenteValidationError("Une vente doit contenir au moins une ligne.");
    }
    if (!input.clientTelephone || input.clientTelephone.trim().length === 0) {
      throw new VenteValidationError("Le numéro de téléphone du client est obligatoire.");
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
          const disponible = this.stockRepository.getQuantite(produit.id, allocation.emplacementId);
          const delta = domainStock.applySortie(allocation.emplacementId, disponible, allocation.quantite);
          this.stockRepository.applyDelta({ ...delta, produitId: produit.id });
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

        const ligneFacture = domainInvoicing.buildLigneFacture({
          produitId: produit.id,
          motif: produit.motif,
          taille: produit.taille,
          prixUnitaire: ligne.prixUnitaire,
          quantiteInterne: quantiteAllouee,
          quantiteExterne,
          fournisseur: ligne.fournisseurExterne,
          prixAchatExterne: ligne.prixAchatExterne,
        });
        lignesFacture.push(ligneFacture);

        const releve = domainInvoicing.buildLignesReleveInterne([
          {
            produitId: produit.id,
            motif: produit.motif,
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

      const total = domainInvoicing.calculerTotalFacture(lignesFacture);
      const vendeurEffectif = domainVendeur.resolveVendeurEffectif({
        compteConnecteNom: input.vendeurCompteConnecteNom,
        vendeurNomManuel: input.vendeurNomManuel,
      });

      const numero = this.factureRepository.nextNumero();
      const now = new Date().toISOString();
      const factureId = this.factureRepository.create({
        numero,
        date: now,
        // Le point de vente (SHOP) — jamais un dépôt : une vente peut
        // désormais provenir de deux dépôts à la fois, ce champ ne peut
        // donc plus représenter "le" dépôt utilisé (correction Phase 2).
        emplacementId: input.pointDeVenteId,
        clientNom: input.clientNom,
        clientTelephone: input.clientTelephone,
        clientAdresse: input.clientAdresse,
        vendeurUtilisateurId: input.vendeurUtilisateurId,
        vendeurNomManuel: vendeurEffectif.estPrecisionManuelle ? input.vendeurNomManuel : null,
        modeReglement: input.modeReglement,
        lignes: lignesFacture,
        total,
      });

      this.factureRepository.createReleveInterne(factureId, lignesReleveInterne);

      for (const m of mouvementsAEnregistrer) {
        this.mouvementRepository.create({
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
      }

      return { factureId, numero, total };
    });

    return executer();
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
  annulerVente(factureId: string, motif: string, annuleePar: string): void {
    if (!motif || motif.trim().length === 0) {
      throw new VenteValidationError("Un motif d'annulation est requis.");
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

      for (const m of mouvements) {
        if (m.type !== "sortie" || !m.emplacementId) continue; // rien à restaurer pour la part externe
        const delta = domainStock.applyEntree(m.emplacementId, m.quantite);
        this.stockRepository.applyDelta({ ...delta, produitId: m.produitId });
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
    });

    executer();
  }
}
