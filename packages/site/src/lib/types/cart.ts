/**
 * Le panier est strictement local au navigateur (cahier des charges §8,
 * Synthèse étape 4 : "jamais transmis avant l'envoi effectif de la demande").
 * Il n'est donc pas défini dans shared-types (pas d'entité serveur), mais
 * regroupé ici pour rester isolé du reste du domaine catalogue.
 */
export interface CartLine {
  productModelId: string;
  productModelSlug: string;
  productModelName: string;
  imageUrl: string;
  variantId: string;
  size: string;
  reference: string;
  unitPriceFcfa: number;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
}
