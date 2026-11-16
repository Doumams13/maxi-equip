import type { MetierEntity, SoftDeletable, SyncStatus, UUID } from "./common.js";

/**
 * Unité de vente — fondations quincaillerie (Phase 1). Une variante se
 * vend "au carton" (comportement historique, prix/m²) OU selon une
 * autre unité (pièce, sac, mètre, kg, litre), auquel cas
 * largeur/hauteur/carreauxParCarton restent `null` et `taille` devient
 * un libellé libre saisi par l'utilisateur (ex. "Sac 50kg") plutôt
 * qu'un format L×H calculé.
 *
 * `null`/absent = "carton" (produit créé avant cette évolution — jamais
 * réinterprété autrement, pour ne rien casser sur le catalogue carreaux
 * existant).
 */
export type UniteVente = "carton" | "piece" | "sac" | "metre" | "kg" | "litre";

export const UNITES_VENTE: { valeur: UniteVente; libelle: string }[] = [
  { valeur: "carton", libelle: "Carton (carreaux — prix au m²)" },
  { valeur: "piece", libelle: "Pièce" },
  { valeur: "sac", libelle: "Sac" },
  { valeur: "metre", libelle: "Mètre linéaire" },
  { valeur: "kg", libelle: "Kilogramme" },
  { valeur: "litre", libelle: "Litre" },
];

/** Libellé d'affichage (singulier/pluriel) d'une unité de vente — factures, stock, dashboard, site public. */
export const LIBELLE_UNITE_VENTE: Record<UniteVente, { singulier: string; pluriel: string }> = {
  carton: { singulier: "carton", pluriel: "cartons" },
  piece: { singulier: "pièce", pluriel: "pièces" },
  sac: { singulier: "sac", pluriel: "sacs" },
  metre: { singulier: "mètre", pluriel: "mètres" },
  kg: { singulier: "kg", pluriel: "kg" },
  litre: { singulier: "litre", pluriel: "litres" },
};

/** `uniteVente` d'un produit, en traitant `null`/absent comme "carton" (comportement historique). */
export function uniteVenteEffective(produit: Pick<Produit, "uniteVente">): UniteVente {
  return produit.uniteVente ?? "carton";
}

/** Libellé pluriel/singulier prêt à l'affichage pour une quantité donnée (ex. "3 sacs", "1 pièce"). */
export function libelleQuantiteUnite(quantite: number, unite: UniteVente): string {
  const { singulier, pluriel } = LIBELLE_UNITE_VENTE[unite];
  return quantite === 1 ? singulier : pluriel;
}

/**
 * Formate une ventilation de quantités par unité pour affichage — ex.
 * "40 cartons, 12 sacs" — fondations quincaillerie (Phase 4, correction
 * "le bilan additionne des quantités d'unités différentes") : jamais un
 * total unique mélangeant des unités distinctes, toujours une liste
 * explicite. `null` si la ventilation est vide — l'appelant choisit
 * alors son propre libellé de remplacement ("Aucun stock", "Aucun
 * mouvement"...), jamais un texte générique inventé ici.
 */
export function formaterVentilationUnites(ventilation: { unite: UniteVente; quantite: number }[]): string | null {
  if (ventilation.length === 0) return null;
  return ventilation.map((v) => `${v.quantite} ${libelleQuantiteUnite(v.quantite, v.unite)}`).join(", ");
}

/**
 * Modèle/motif de carreau — regroupe plusieurs variantes (formats/tailles).
 * Un modèle a un motif visuel commun à toutes ses variantes (ex. "Marbre
 * Blanc") avec le même type de carreau (ex. "Grès cérame"). Les images
 * appartiennent au modèle, pas à une variante spécifique.
 */
export interface ModeleProduit extends MetierEntity, SoftDeletable {
  motif: string;
  type: string;
  /**
   * Position d'affichage dans la vitrine de la page d'accueil du site
   * public (0 = premier affiché). `null` = ce modèle n'est pas
   * sélectionné pour la vitrine — correction "choisir quels carreaux
   * s'affichent en première page" (sans ce champ, TOUS les modèles
   * ayant une image étaient candidats, sans distinction possible une
   * fois le catalogue volumineux).
   */
  ordreVitrine: number | null;
  /**
   * Fondations quincaillerie (Phase 1 : schéma seulement ; câblage type +
   * repository en Phase 2). `null` = non classé (cas transitoire — la
   * migration rattache tout modèle existant à "Carrelage et
   * revêtements", voir migrate.ts). Optionnel pour ne jamais casser un
   * objet `ModeleProduit` construit avant cette évolution.
   */
  sousCategorieId?: string | null;
  /** Marque du modèle (ex. "Nicoll", "Somany") — `null`/absent = non renseignée. */
  marque?: string | null;
}

/**
 * Carreau du catalogue — variante d'un modèle (un format/taille précis).
 * Chaque variante a sa propre taille, référence et prix. Liée à son modèle
 * via `modeleId`. `motif` et `type` sont dénormalisés depuis le modèle pour
 * l'affichage historique dans les factures/mouvements.
 */
export interface Produit extends MetierEntity, SoftDeletable {
  /** Identifiant du modèle parent. Null pour les lignes antérieures à la migration multi-format. */
  modeleId: string | null;
  /** Dénormalisé depuis ModeleProduit — conservé pour l'affichage dans les factures/historique. */
  motif: string;
  /** Dénormalisé depuis ModeleProduit. */
  type: string;
  /** Dénormalisé depuis ModeleProduit — voir ModeleProduit.marque. */
  marque?: string | null;
  taille: string;
  tailleTri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  /**
   * Prix catalogue, en FCFA **au m²** — jamais modifié par une promotion
   * ou une vente. Correction "le prix de référence est au m²" (2026-10-08) :
   * ce champ représentait auparavant un prix de carton sans qu'aucun
   * endroit ne le documente — c'est désormais un prix au m², le prix du
   * carton se calculant via `carreauxParCarton` ci-dessous (voir
   * @maxi-equip/domain, pricing/surfaceCarton.ts).
   */
  prix: number;
  /**
   * Nombre de carreaux contenus dans un carton de cette taille — varie
   * selon la taille (ex. 4 pour un 60×60, 12 pour un 40×40), aucune
   * formule universelle, donnée saisie manuellement. `null` tant que non
   * renseigné (produits créés avant cette correction, ou en attente de
   * saisie) — dans ce cas, aucun prix de carton ne peut être calculé.
   */
  carreauxParCarton: number | null;
  seuilAlerte: number;
  /**
   * Fondations quincaillerie (Phase 1) — voir UniteVente plus haut.
   * `null`/absent = "carton" (toujours le cas pour les carreaux
   * existants). Optionnel pour ne jamais casser un objet `Produit`
   * construit avant cette évolution (tests, mappers) qui ne connaît pas
   * ce champ.
   */
  uniteVente?: UniteVente | null;
  /**
   * Caractéristiques libres (diamètre, poids, coloris, voltage…) —
   * affichées telles quelles sur la facture et le site public dans une
   * colonne/ligne dédiée. Paires clé/valeur encodées en JSON (voir
   * shared-types/caracteristiques.ts), jamais un formulaire par famille
   * de produit (décision explicite du client). `null`/absent = aucune
   * caractéristique renseignée (cas normal pour un carreau, où
   * taille/motif suffisent).
   */
  caracteristiques?: string | null;
}

export type ImageKind = "produit" | "logo";

export interface ImageProduit extends MetierEntity {
  /** Identifiant du modèle auquel appartient cette image (remplace l'ancien produitId variant-level). */
  modeleId: UUID;
  kind: ImageKind;
  /** Chemin/référence de stockage local, avant synchronisation. */
  cheminLocal: string;
  /** URL de stockage cloud, renseignée une fois synchronisée. */
  urlCloud: string | null;
  ordre: number;
  /** true pour l'image utilisée comme miniature (liste produits, colonne "Motif") — une seule par modèle. */
  estPrincipale: boolean;
  syncStatus: SyncStatus;
}
