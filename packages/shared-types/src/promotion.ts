import type { ISODateTime, MetierEntity, UUID } from "./common.js";

/**
 * Promotion. Cahier des charges §10 : prix normal et prix promotionnel
 * toujours distincts — le prix catalogue du produit n'est jamais modifié.
 * Le prix "effectif" à un instant donné est toujours calculé (voir
 * packages/domain), jamais stocké en double ici.
 */
export interface Promotion extends MetierEntity {
  produitId: UUID;
  prixPromotionnel: number;
  dateDebut: ISODateTime;
  dateFin: ISODateTime;
}
