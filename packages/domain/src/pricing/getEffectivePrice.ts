import type { ISODateTime, Produit, Promotion } from "@maxi-equip/shared-types";

export interface EffectivePrice {
  price: number;
  isPromoActive: boolean;
  originalPrice: number;
  promotionId: string | null;
}

export class InvalidPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPromotionError";
  }
}

/**
 * Calcule le prix après application d'une réduction.
 * - "pourcentage" : Math.round(prixNormal * (1 - valeur / 100)), jamais < 1.
 * - "montant_fixe" : prixNormal - valeur, jamais < 1.
 */
export function calculerPrixApresReduction(
  prixNormal: number,
  typeReduction: Promotion["typeReduction"],
  valeur: number
): number {
  let prix: number;
  if (typeReduction === "pourcentage") {
    prix = Math.round(prixNormal * (1 - valeur / 100));
  } else {
    prix = prixNormal - valeur;
  }
  return Math.max(1, prix);
}

/**
 * Valide la structure d'une promotion avant qu'elle ne soit prise en
 * compte. Invalide si :
 * - la valeur n'est pas un nombre strictement positif ;
 * - pour "pourcentage", la valeur dépasse 100 ;
 * - la date de début n'est pas strictement antérieure à la date de fin.
 */
export function assertValidPromotion(promotion: Pick<Promotion, "typeReduction" | "valeur" | "dateDebut" | "dateFin">): void {
  if (!Number.isFinite(promotion.valeur) || promotion.valeur <= 0) {
    throw new InvalidPromotionError(
      `La valeur de la réduction doit être un nombre strictement positif (reçu : ${promotion.valeur}).`
    );
  }
  if (promotion.typeReduction === "pourcentage" && promotion.valeur > 100) {
    throw new InvalidPromotionError(
      `Un pourcentage de réduction ne peut pas dépasser 100 (reçu : ${promotion.valeur}).`
    );
  }
  const start = new Date(promotion.dateDebut).getTime();
  const end = new Date(promotion.dateFin).getTime();
  if (!(start < end)) {
    throw new InvalidPromotionError("La date de début d'une promotion doit être strictement antérieure à sa date de fin.");
  }
}

/**
 * Calcule le prix effectif d'un produit à une date donnée.
 *
 * Règle métier : le prix catalogue du produit n'est JAMAIS modifié par
 * une promotion. Le prix affiché ou appliqué est toujours recalculé.
 *
 * Si plusieurs promotions sont actives (ne devrait pas arriver grâce au
 * contrôle de conflit, mais en cas de données historiques incohérentes),
 * retient celle qui produit le prix final le plus bas (la plus avantageuse
 * pour le client).
 *
 * @param produit Le produit dont on veut le prix effectif.
 * @param promotions Les promotions actives pouvant s'appliquer à ce produit
 *   (filtrage par produitId/périmètre laissé à l'appelant).
 * @param atDate Date de référence (par défaut : maintenant).
 */
export function getEffectivePrice(
  produit: Pick<Produit, "prix">,
  promotions: Pick<Promotion, "id" | "typeReduction" | "valeur" | "dateDebut" | "dateFin">[],
  atDate: ISODateTime = new Date().toISOString()
): EffectivePrice {
  const now = new Date(atDate).getTime();

  let meilleurePrix: number | null = null;
  let meilleurePromoId: string | null = null;

  for (const promo of promotions) {
    assertValidPromotion(promo);
    const start = new Date(promo.dateDebut).getTime();
    const end = new Date(promo.dateFin).getTime();
    if (now < start || now > end) continue;
    const prixApres = calculerPrixApresReduction(produit.prix, promo.typeReduction, promo.valeur);
    if (meilleurePrix === null || prixApres < meilleurePrix) {
      meilleurePrix = prixApres;
      meilleurePromoId = promo.id;
    }
  }

  if (meilleurePrix === null) {
    return { price: produit.prix, isPromoActive: false, originalPrice: produit.prix, promotionId: null };
  }

  return {
    price: meilleurePrix,
    isPromoActive: true,
    originalPrice: produit.prix,
    promotionId: meilleurePromoId,
  };
}
