import type { MetierEntity, SoftDeletable, SyncStatus, UUID } from "./common.js";

/**
 * Carreau du catalogue. Cahier des charges §4 : modèle/motif, type, taille,
 * référence, prix, stock, images. Type et taille sont des champs de saisie
 * libre avec autocomplétion (jamais une liste fermée) — cette contrainte
 * concerne l'interface, pas la forme des données elle-même.
 *
 * La taille est volontairement dédoublée : `taille` (texte affiché tel quel,
 * ex. "60x60 cm") et `tailleTri` (valeur numérique extraite, ex. 60), pour
 * permettre un tri fiable sans reparser le texte à chaque requête (§4 —
 * "tri notamment par taille et date").
 */
export interface Produit extends MetierEntity, SoftDeletable {
  motif: string;
  type: string;
  taille: string;
  tailleTri: number;
  /** Dimension numérique isolée (correction Phase 2 §14/15) — permet un filtrage/tri fiable sans reparser `taille`. Nullable : les produits créés avant cette évolution ne sont pas rétroactivement modifiés. */
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  /** Prix catalogue, en FCFA. Jamais modifié par une promotion ou une vente. */
  prix: number;
  seuilAlerte: number;
}

export type ImageKind = "produit" | "logo";

export interface ImageProduit extends MetierEntity {
  produitId: UUID;
  kind: ImageKind;
  /** Chemin/référence de stockage local, avant synchronisation. */
  cheminLocal: string;
  /** URL de stockage cloud, renseignée une fois synchronisée. */
  urlCloud: string | null;
  ordre: number;
  /** true pour l'image utilisée comme miniature (liste produits, colonne "Motif") — une seule par produit. */
  estPrincipale: boolean;
  syncStatus: SyncStatus;
}
