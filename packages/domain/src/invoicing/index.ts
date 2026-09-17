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
    taille: source.taille,
    quantite: source.quantiteInterne + source.quantiteExterne,
    prixUnitaire: source.prixUnitaire,
    prixUnitaireNormal: source.prixUnitaireNormal ?? null,
    promotionId: source.promotionId ?? null,
    promotionLibelle: source.promotionLibelle ?? null,
    promotionType: source.promotionType ?? null,
    promotionValeur: source.promotionValeur ?? null,
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
