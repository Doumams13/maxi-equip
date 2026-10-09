/**
 * Règles métier de facturation — cahier des charges §6, §7, §11,
 * Corrections §12. RÈGLE LA PLUS CRITIQUE DU PROJET :
 *
 * Même lorsqu'une vente utilise simultanément du stock interne et un
 * approvisionnement externe pour un même produit, la facture client doit
 * présenter UNE SEULE ligne commerciale cohérente et ne doit JAMAIS
 * révéler : fournisseur, coût d'achat, source d'approvisionnement, ni la
 * décomposition interne/externe. Ces informations vivent exclusivement
 * dans le relevé interne, une structure séparée.
 *
 * Ce module ne dépend d'aucune base de données : il construit des objets
 * en mémoire à partir de données déjà résolues (prix, quantités), fournies
 * par l'appelant (services de la couche application, Phase 2/3).
 */

import type { LigneFacture, LigneReleveInterne } from "@maxi-equip/shared-types";

export class InvalidInvoiceLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInvoiceLineError";
  }
}

/** Entrée décrivant une ligne de vente avant fusion, avec sa provenance. */
export interface VenteLigneSource {
  produitId: string | null;
  motif: string;
  /** Référence du produit au moment de la vente — snapshot, voir LigneFacture. */
  reference: string;
  taille: string;
  prixUnitaire: number;
  /** Quantité prélevée du stock MAXI EQUIP pour cette ligne. */
  quantiteInterne: number;
  /** Quantité obtenue via un approvisionnement externe pour cette ligne. */
  quantiteExterne: number;
  /** Renseigné uniquement si quantiteExterne > 0. */
  fournisseur?: string;
  /** Coût d'achat unitaire externe — renseigné uniquement si quantiteExterne > 0. */
  prixAchatExterne?: number;
  /** Promotion appliquée — null si aucune promotion active au moment de la vente. */
  prixUnitaireNormal?: number | null;
  promotionId?: string | null;
  promotionLibelle?: string | null;
  promotionType?: string | null;
  promotionValeur?: number | null;
  /** Surface d'un carton de ce produit en m², au moment de la vente — voir shared-types/facture.ts. */
  surfaceCartonM2?: number | null;
}

function assertCoherentSource(source: VenteLigneSource): void {
  const total = source.quantiteInterne + source.quantiteExterne;
  if (total <= 0) {
    throw new InvalidInvoiceLineError(`La ligne "${source.motif} ${source.taille}" doit avoir une quantité totale strictement positive.`);
  }
  if (source.quantiteExterne > 0 && (!source.fournisseur || source.prixAchatExterne === undefined)) {
    throw new InvalidInvoiceLineError(
      `La ligne "${source.motif} ${source.taille}" a une quantité externe (${source.quantiteExterne}) sans fournisseur ni coût d'achat renseignés.`
    );
  }
}

/**
 * Construit la ligne de facture CLIENT à partir d'une source interne/externe.
 *
 * RÈGLE CRITIQUE (vérifiée par le type de retour lui-même) : le type
 * `LigneFacture` ne contient structurellement aucun champ fournisseur ou
 * prix d'achat — il est donc impossible, même par erreur de programmation,
 * de faire fuiter cette information dans la facture via cette fonction.
 * La quantité affichée est la somme interne + externe, fusionnée en une
 * seule ligne (§7 — exemple du cahier des charges : 20 + 10 = 30).
 */
export function buildLigneFacture(source: VenteLigneSource): LigneFacture {
  assertCoherentSource(source);
  return {
    produitId: source.produitId,
    motif: source.motif,
    reference: source.reference,
    taille: source.taille,
    quantite: source.quantiteInterne + source.quantiteExterne,
    prixUnitaire: source.prixUnitaire,
    prixUnitaireNormal: source.prixUnitaireNormal ?? null,
    promotionId: source.promotionId ?? null,
    promotionLibelle: source.promotionLibelle ?? null,
    promotionType: source.promotionType ?? null,
    promotionValeur: source.promotionValeur ?? null,
    surfaceCartonM2: source.surfaceCartonM2 ?? null,
  };
}

/**
 * Construit la ou les lignes du relevé interne d'approvisionnement,
 * STRICTEMENT à partir des sources ayant une part externe. Ne produit
 * rien pour les lignes entièrement internes (rien à tracer).
 */
export function buildLignesReleveInterne(sources: VenteLigneSource[]): LigneReleveInterne[] {
  return sources
    .filter((s) => s.quantiteExterne > 0)
    .map((s) => {
      assertCoherentSource(s);
      return {
        motif: s.motif,
        taille: s.taille,
        quantite: s.quantiteExterne,
        fournisseur: s.fournisseur!,
        prixAchat: s.prixAchatExterne!,
        prixVente: s.prixUnitaire,
      };
    });
}

/** Calcule le total d'une ligne de facture (quantité × prix unitaire). */
export function calculerTotalLigne(ligne: Pick<LigneFacture, "quantite" | "prixUnitaire">): number {
  return ligne.quantite * ligne.prixUnitaire;
}

/**
 * Calcule le total d'une facture à partir de ses lignes.
 * Le résultat est ensuite STOCKÉ dans `Facture.total` (dénormalisation
 * délibérée : les requêtes SQL d'agrégation — CA du mois, dashboard —
 * en ont besoin). Ce champ est toujours alimenté par cette fonction à
 * la création ; il ne doit jamais être mis à jour indépendamment des lignes.
 */
export function calculerTotalFacture(lignes: Pick<LigneFacture, "quantite" | "prixUnitaire">[]): number {
  return lignes.reduce((total, ligne) => total + calculerTotalLigne(ligne), 0);
}

/**
 * Remise commerciale exceptionnelle sur une vente — correction "Remise /
 * Négociation". Distincte d'une promotion catalogue (prix avec période,
 * voir pricing/getEffectivePrice.ts) : la remise ne modifie JAMAIS le
 * prix catalogue ni `Facture.total`, uniquement ce que le client paie
 * réellement.
 *
 * Validation centralisée ici (règle métier, jamais réimplémentée dans
 * VenteService ni dans l'écran) : une remise négative n'a aucun sens
 * commercial ; une remise strictement supérieure au total donnerait un
 * montant à payer négatif, jamais accepté.
 */
export class InvalidRemiseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRemiseError";
  }
}

export function validerRemise(remise: number, total: number): void {
  if (!Number.isFinite(remise) || remise < 0) {
    throw new InvalidRemiseError(`La remise doit être un nombre positif ou nul (reçu : ${remise}).`);
  }
  if (remise > total) {
    throw new InvalidRemiseError(`La remise (${remise} FCFA) ne peut pas dépasser le total de la vente (${total} FCFA).`);
  }
}

/** Total réellement dû par le client après remise — jamais négatif (déjà garanti par validerRemise, Math.max ici en filet de sécurité). */
export function calculerTotalNet(total: number, remise: number): number {
  return Math.max(0, total - remise);
}

/**
 * Statut de paiement d'une vente — correction "Réservation / Acompte".
 * Distinct du statut de LIVRAISON (`Facture.statutLivraison`) : une vente
 * "payee" peut être livrée ou non, une "reservation" ne devrait jamais
 * être livrée (le CGV impose un paiement intégral avant livraison), mais
 * ce n'est pas imposé ici — c'est à l'appelant (VenteService) de ne
 * jamais proposer "livrée" tant que le statut reste "reservation".
 */
export type StatutPaiement = "reservation" | "payee";

export class InvalidMontantPayeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMontantPayeError";
  }
}

/**
 * Valide la cohérence entre le statut de paiement et le montant réellement
 * encaissé, par rapport au total net (après remise) de la vente :
 *  - "payee" : le montant payé doit être EXACTEMENT le total net (sinon ce
 *    n'est pas réellement payé intégralement) — y compris 0 dans le cas
 *    limite d'une vente entièrement remisée (total net nul) ;
 *  - "reservation" : le montant payé (l'acompte) doit être strictement
 *    positif et strictement inférieur au total net (un acompte égal au
 *    total n'est plus une réservation, c'est un paiement complet — et un
 *    acompte nul n'est pas un acompte).
 */
export function validerMontantPaye(statutPaiement: StatutPaiement, montantPaye: number, totalNet: number): void {
  if (!Number.isFinite(montantPaye) || montantPaye < 0) {
    throw new InvalidMontantPayeError(`Le montant payé doit être un nombre positif ou nul (reçu : ${montantPaye}).`);
  }
  if (statutPaiement === "payee") {
    if (montantPaye !== totalNet) {
      throw new InvalidMontantPayeError(
        `Une vente marquée "payée intégralement" doit avoir un montant payé (${montantPaye} FCFA) égal au total net (${totalNet} FCFA).`
      );
    }
  } else if (montantPaye <= 0 || montantPaye >= totalNet) {
    throw new InvalidMontantPayeError(
      `L'acompte d'une réservation (${montantPaye} FCFA) doit être strictement positif et strictement inférieur au total net (${totalNet} FCFA).`
    );
  }
}

/** Solde restant à encaisser sur une réservation — jamais négatif (filet de sécurité, déjà garanti par validerMontantPaye). */
export function calculerSoldeRestant(totalNet: number, montantPaye: number): number {
  return Math.max(0, totalNet - montantPaye);
}

/**
 * Vérifie qu'un objet destiné à être transmis/affiché au client ne
 * contient aucune des clés sensibles réservées au relevé interne.
 * Filet de sécurité supplémentaire, utile notamment en test, pour
 * détecter une régression qui ajouterait par erreur un champ sensible
 * à une ligne de facture (§7, §11).
 */
const CHAMPS_INTERDITS_FACTURE_CLIENT = ["fournisseur", "prixAchat", "prixAchatExterne", "quantiteExterne", "quantiteInterne"];

export function assertAucuneDonneeInterneExposee(objet: object): void {
  for (const champ of CHAMPS_INTERDITS_FACTURE_CLIENT) {
    if (champ in objet) {
      throw new InvalidInvoiceLineError(
        `Champ interdit "${champ}" détecté dans une donnée destinée au client — fuite potentielle d'information interne (§7/§11).`
      );
    }
  }
}
