import type { ISODateTime, MetierEntity, UUID } from "./common.js";

/**
 * Quantité en cartons d'un produit à un emplacement donné.
 * Cahier des charges §5 : "Stock consultable séparément pour Akébé et Akanda."
 */
export interface Stock extends MetierEntity {
  produitId: UUID;
  emplacementId: UUID;
  quantite: number;
}

export type MouvementType = "entree" | "sortie" | "transfert";

/**
 * Mouvement de stock. Cahier des charges §5 :
 * - Entrée : augmente le stock du dépôt concerné.
 * - Sortie (vente) : diminue le stock réellement prélevé.
 * - Transfert : diminue le dépôt source, augmente le dépôt destination ;
 *   jamais de facture, jamais de chiffre d'affaires (§5, §12).
 *
 * Corrections §4 : chaque mouvement est transmis et appliqué côté serveur
 * comme une variation RELATIVE (delta), jamais comme une valeur absolue.
 * `quantite` est donc toujours positive ; le sens de la variation est
 * déterminé par `type` (+ pour entrée, - pour sortie, delta signé pour
 * transfert selon l'emplacement source/destination).
 */
export interface Mouvement extends MetierEntity {
  type: MouvementType;
  produitId: UUID;

  /** Renseigné pour une entrée ou une sortie. */
  emplacementId: UUID | null;

  /** Renseignés uniquement pour un transfert. */
  emplacementSourceId: UUID | null;
  emplacementDestinationId: UUID | null;

  quantite: number;
  date: ISODateTime;

  /** Renseigné uniquement pour une sortie liée à une vente confirmée. */
  factureId: UUID | null;

  /**
   * Auteur réel de l'opération — correction "logique des dashboards
   * Administrateur/Gérant" : source unique servant à distinguer les
   * données globales (Administrateur) des données personnelles (Gérant,
   * filtré sur son propre identifiant). Nullable : les mouvements
   * enregistrés avant cette évolution n'ont jamais eu d'auteur tracé.
   */
  utilisateurId: UUID | null;

  note: string | null;
}
