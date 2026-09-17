import type { ISODateTime } from "./common.js";

export type TypeReductionPromotion = "pourcentage" | "montant_fixe";
export type PerimetrePromotion = "global" | "cible";

/**
 * Promotion commerciale. Cahier des charges §10 et §§1-20 de la
 * spécification promotions : le prix catalogue du produit n'est JAMAIS
 * modifié — le prix effectif est toujours recalculé à partir du prix
 * catalogue et de la promotion active, jamais stocké en double.
 *
 * - typeReduction = "pourcentage" : valeur = 0-100, prix final =
 *   Math.round(prixNormal * (1 - valeur / 100)), jamais < 1 FCFA.
 * - typeReduction = "montant_fixe" : valeur = montant FCFA à déduire,
 *   prix final = prixNormal - valeur, jamais < 1 FCFA.
 * - perimetre = "global" : s'applique à tous les produits du catalogue.
 * - perimetre = "cible" : s'applique uniquement aux produits listés dans
 *   produitIds (jamais vide pour ce périmètre).
 */
export interface Promotion {
  id: string;
  libelle: string;
  typeReduction: TypeReductionPromotion;
  valeur: number;
  perimetre: PerimetrePromotion;
  produitIds: string[];
  dateDebut: ISODateTime;
  dateFin: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
