import type { ISODateTime, Produit, Promotion } from "@maxi-equip/shared-types";

export interface EffectivePrice {
  price: number;
  isPromoActive: boolean;
  originalPrice: number;
}

export class InvalidPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPromotionError";
  }
}

/**
 * Valide la structure d'une promotion avant qu'elle ne soit prise en
 * compte. Cahier des charges §10 : une promotion a un prix promotionnel
 * et une période de validité — ces deux éléments doivent être cohérents.
 *
 * Invalide si :
 * - le prix promotionnel n'est pas un nombre strictement positif ;
 * - la date de début n'est pas strictement antérieure à la date de fin.
 */
export function assertValidPromotion(promotion: Pick<Promotion, "prixPromotionnel" | "dateDebut" | "dateFin">): void {
  if (!Number.isFinite(promotion.prixPromotionnel) || promotion.prixPromotionnel <= 0) {
    throw new InvalidPromotionError(
      `Le prix promotionnel doit être un nombre strictement positif (reçu : ${promotion.prixPromotionnel}).`
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
 * Règle métier (cahier des charges §10, Synthèse §6, Corrections §6/§8) :
 * le prix catalogue du produit n'est JAMAIS modifié par une promotion.
 * Le prix affiché ou appliqué à une vente est toujours RECALCULÉ à partir
 * du prix catalogue et d'une promotion active à la date donnée — jamais
 * stocké en double quelque part.
 *
 * @param produit Le produit dont on veut le prix effectif.
 * @param promotions Les promotions existantes pour CE produit (le tri/filtrage
 *   par produit est laissé à l'appelant, qui a accès au dépôt de données).
 * @param atDate Date de référence (par défaut : maintenant).
 */
export function getEffectivePrice(
  produit: Pick<Produit, "prix">,
  promotions: Pick<Promotion, "prixPromotionnel" | "dateDebut" | "dateFin">[],
  atDate: ISODateTime = new Date().toISOString()
): EffectivePrice {
  const now = new Date(atDate).getTime();

  const active = promotions.find((promo) => {
    const start = new Date(promo.dateDebut).getTime();
    const end = new Date(promo.dateFin).getTime();
    return now >= start && now <= end;
  });

  if (!active) {
    return { price: produit.prix, isPromoActive: false, originalPrice: produit.prix };
  }

  return {
    price: active.prixPromotionnel,
    isPromoActive: true,
    originalPrice: produit.prix,
  };
}
