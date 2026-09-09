import type { MetierEntity } from "./common.js";

/**
 * Un emplacement est le SHOP (point de vente) ou un dépôt (Akébé, Akanda).
 * Cahier des charges §2 : "Akébé et Akanda sont des lieux de stockage suivis
 * depuis le SHOP." Structure volontairement extensible pour une future
 * évolution multi-poste (Synthèse §9), sans être activée en V1.
 */
export type EmplacementType = "shop" | "depot";

export interface Emplacement extends MetierEntity {
  nom: string;
  type: EmplacementType;
  ville: string;
  /** true uniquement pour le SHOP — seul emplacement pouvant émettre une facture. */
  estPointDeVente: boolean;
  /** Archivage (jamais une suppression physique) — correction "Points de vente dynamiques" §5/§9. */
  actif: boolean;
}
