import type { EffectivePrice, Promotion } from "@/lib/types/catalog";

/**
 * Calcul du prix effectif d'une variante à la date courante.
 *
 * Reproduit côté frontend la règle métier décrite dans le compte-rendu
 * Phase 1 (§4, module pricing/getEffectivePrice) : le prix catalogue n'est
 * JAMAIS modifié par une promotion, et le prix promotionnel n'est retenu que
 * si la période est valide à l'instant présent. La vraie logique côté
 * back-end (packages/domain) restera la source d'autorité une fois l'API
 * branchée ; cette fonction ne sert qu'à l'affichage en Phase 5.
 */
export function getEffectivePrice(
  normalPriceFcfa: number,
  applicablePromotions: Promotion[],
  now: Date = new Date()
): EffectivePrice {
  const active = applicablePromotions.find((promo) => {
    const starts = new Date(promo.startsAt).getTime();
    const ends = new Date(promo.endsAt).getTime();
    const t = now.getTime();
    return isValidPromotion(promo) && t >= starts && t <= ends;
  });

  if (!active) {
    return {
      normalPriceFcfa,
      promoPriceFcfa: null,
      isPromotionActive: false,
      discountPercent: null,
    };
  }

  return {
    normalPriceFcfa,
    promoPriceFcfa: active.promoPriceFcfa,
    isPromotionActive: true,
    discountPercent: computeDiscountPercent(normalPriceFcfa, active.promoPriceFcfa),
  };
}

/**
 * Calcule le pourcentage de réduction entre un prix normal et un prix
 * promotionnel, arrondi à l'entier le plus proche pour l'affichage
 * (ex. 15 000 → 12 500 = 16,67 % → affiché "-17 %").
 *
 * Point d'entrée UNIQUE pour ce calcul : ne pas le dupliquer dans les
 * composants (ProductCard, Hero, fiche produit…) — toujours passer par
 * `getEffectivePrice`, qui l'expose via `EffectivePrice.discountPercent`.
 */
export function computeDiscountPercent(
  normalPriceFcfa: number,
  promoPriceFcfa: number
): number {
  if (normalPriceFcfa <= 0) return 0;
  const raw = ((normalPriceFcfa - promoPriceFcfa) / normalPriceFcfa) * 100;
  return Math.round(raw);
}

/** Une promotion est invalide si le prix promotionnel n'est pas strictement positif, ou si la période est incohérente (début < fin) — règle reprise du compte-rendu Phase 1, §4. */
export function isValidPromotion(promo: Promotion): boolean {
  if (promo.promoPriceFcfa <= 0) return false;
  return new Date(promo.startsAt).getTime() < new Date(promo.endsAt).getTime();
}

/** Filtre les promotions applicables à une variante précise d'un modèle (promotion générale au modèle, ou ciblée sur cette variante). */
export function promotionsForVariant(
  allPromotions: Promotion[],
  productModelId: string,
  variantId: string
): Promotion[] {
  return allPromotions.filter(
    (p) =>
      p.productModelId === productModelId &&
      (!p.variantId || p.variantId === variantId)
  );
}

/**
 * Détermine le prix (et la promotion éventuelle) à afficher sur une carte
 * catalogue pour un modèle regroupant plusieurs tailles.
 *
 * RÈGLE DE SÉLECTION (déterministe, car un modèle peut avoir une promotion
 * sur une seule variante parmi plusieurs — cf. cahier des charges §10 et
 * consigne explicite : "il ne faut pas prétendre que toutes les tailles sont
 * en promotion") :
 *   1. On calcule le prix effectif (normal ou promotionnel) de CHAQUE
 *      variante indépendamment — jamais de promotion "empruntée" à une autre
 *      taille.
 *   2. On retient la variante dont le prix effectif est le plus bas.
 *   3. En cas d'égalité stricte entre plusieurs variantes, on garde la
 *      première dans l'ordre du tableau `variants` (ordre stable, donc
 *      déterministe et reproductible).
 * Ce prix affiché correspond donc toujours à une variante réellement vendue
 * à ce prix — jamais à une combinaison artificielle. L'indication
 * "à partir de" (fromMultipleSizes) prévient l'utilisateur que d'autres
 * tailles existent, potentiellement à un prix différent, sans promotion.
 */
export function getModelDisplayPrice(
  variants: { id: string; priceFcfa: number }[],
  promotions: Promotion[],
  productModelId: string
): { effective: EffectivePrice; fromMultipleSizes: boolean } {
  const priced = variants.map((v) => ({
    variant: v,
    effective: getEffectivePrice(
      v.priceFcfa,
      promotionsForVariant(promotions, productModelId, v.id)
    ),
  }));

  const cheapest = priced.reduce((min, current) => {
    const currentValue = current.effective.promoPriceFcfa ?? current.effective.normalPriceFcfa;
    const minValue = min.effective.promoPriceFcfa ?? min.effective.normalPriceFcfa;
    return currentValue < minValue ? current : min;
  });

  return {
    effective: cheapest.effective,
    fromMultipleSizes: variants.length > 1,
  };
}
