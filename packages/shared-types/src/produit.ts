import type { MetierEntity, SoftDeletable, SyncStatus, UUID } from "./common.js";

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
