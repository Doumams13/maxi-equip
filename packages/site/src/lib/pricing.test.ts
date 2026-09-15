import { describe, it, expect } from "vitest";
import { getEffectivePrice, getModelDisplayPrice, computeDiscountPercent, isValidPromotion, promotionsForVariant } from "./pricing";
import type { Promotion } from "./types/catalog";

function promo(overrides: Partial<Promotion> = {}): Promotion {
  const now = new Date();
  return {
    id: "promo-test",
    productModelId: "m1",
    variantId: "v1",
    promoPriceFcfa: 8000,
    startsAt: new Date(now.getTime() - 86_400_000).toISOString(),
    endsAt: new Date(now.getTime() + 86_400_000).toISOString(),
    ...overrides,
  };
}

describe("getEffectivePrice", () => {
  it("aucune promotion applicable : prix normal, jamais de promotion active", () => {
    const result = getEffectivePrice(10000, []);
    expect(result).toEqual({ normalPriceFcfa: 10000, promoPriceFcfa: null, isPromotionActive: false, discountPercent: null });
  });

  it("promotion active à l'instant présent : retenue, pourcentage calculé", () => {
    const result = getEffectivePrice(10000, [promo({ promoPriceFcfa: 8000 })]);
    expect(result.isPromotionActive).toBe(true);
    expect(result.promoPriceFcfa).toBe(8000);
    expect(result.discountPercent).toBe(20);
  });

  it("promotion expirée : jamais retenue, prix normal", () => {
    const now = new Date();
    const expiree = promo({ startsAt: new Date(now.getTime() - 20 * 86_400_000).toISOString(), endsAt: new Date(now.getTime() - 5 * 86_400_000).toISOString() });
    const result = getEffectivePrice(10000, [expiree]);
    expect(result.isPromotionActive).toBe(false);
  });

  it("promotion future : jamais retenue, prix normal", () => {
    const now = new Date();
    const future = promo({ startsAt: new Date(now.getTime() + 5 * 86_400_000).toISOString(), endsAt: new Date(now.getTime() + 20 * 86_400_000).toISOString() });
    const result = getEffectivePrice(10000, [future]);
    expect(result.isPromotionActive).toBe(false);
  });

  it("prix promotionnel jamais positif : promotion invalide, ignorée", () => {
    const result = getEffectivePrice(10000, [promo({ promoPriceFcfa: 0 })]);
    expect(result.isPromotionActive).toBe(false);
  });
});

describe("computeDiscountPercent", () => {
  it("arrondi à l'entier le plus proche", () => {
    expect(computeDiscountPercent(15000, 12500)).toBe(17);
  });
  it("prix normal nul ou négatif : jamais de division par zéro, retourne 0", () => {
    expect(computeDiscountPercent(0, 0)).toBe(0);
  });
});

describe("promotionsForVariant", () => {
  const promos = [promo({ productModelId: "m1", variantId: "v1" }), promo({ id: "p2", productModelId: "m1", variantId: undefined }), promo({ id: "p3", productModelId: "m2", variantId: "v1" })];

  it("promotion ciblée sur la variante exacte : retenue", () => {
    expect(promotionsForVariant(promos, "m1", "v1").map((p) => p.id)).toContain("promo-test");
  });
  it("promotion sans variantId : s'applique à toutes les variantes du modèle", () => {
    expect(promotionsForVariant(promos, "m1", "v2").map((p) => p.id)).toContain("p2");
  });
  it("promotion d'un autre modèle : jamais retenue même si le variantId correspond", () => {
    expect(promotionsForVariant(promos, "m1", "v1").map((p) => p.id)).not.toContain("p3");
  });
});

describe("getModelDisplayPrice — cœur des Défauts 3/4", () => {
  it("aucune promotion : la variante la moins chère est affichée, jamais de promotion", () => {
    const variants = [
      { id: "v-petit", priceFcfa: 5000 },
      { id: "v-grand", priceFcfa: 10000 },
    ];
    const result = getModelDisplayPrice(variants, [], "m1");
    expect(result.effective.normalPriceFcfa).toBe(5000);
    expect(result.effective.isPromotionActive).toBe(false);
    expect(result.fromMultipleSizes).toBe(true);
  });

  it("REPRODUCTION EXACTE DU DÉFAUT 3/4 : une promotion sur la variante la plus chère ne doit jamais être affichée si une autre variante moins chère existe sans promotion — reproduit fidèlement 'Marbre Blanc'", () => {
    const variants = [
      { id: "v-40", priceFcfa: 9500 },
      { id: "v-60", priceFcfa: 15000 },
      { id: "v-80", priceFcfa: 21000 },
    ];
    const promos = [promo({ productModelId: "marbre-blanc", variantId: "v-60", promoPriceFcfa: 12500 })];
    const result = getModelDisplayPrice(variants, promos, "marbre-blanc");

    expect(result.effective.normalPriceFcfa).toBe(9500);
    expect(result.effective.isPromotionActive).toBe(false);
    expect(result.effective.promoPriceFcfa).toBeNull();
  });

  it("une promotion qui rend une variante réellement la moins chère est bien affichée avec son badge", () => {
    const variants = [
      { id: "v-40", priceFcfa: 9500 },
      { id: "v-60", priceFcfa: 15000 },
    ];
    const promos = [promo({ productModelId: "m1", variantId: "v-60", promoPriceFcfa: 8000 })];
    const result = getModelDisplayPrice(variants, promos, "m1");

    expect(result.effective.isPromotionActive).toBe(true);
    expect(result.effective.promoPriceFcfa).toBe(8000);
  });

  it("promotion sans variantId (toutes les tailles) : reconnue comme applicable à chaque variante", () => {
    const promos = [promo({ productModelId: "m1", variantId: undefined, promoPriceFcfa: 4000 })];
    expect(promotionsForVariant(promos, "m1", "v-petit")).toHaveLength(1);
    expect(promotionsForVariant(promos, "m1", "v-grand")).toHaveLength(1);
  });
});

describe("isValidPromotion", () => {
  it("période incohérente (fin avant début) : invalide", () => {
    expect(isValidPromotion(promo({ startsAt: "2026-06-10T00:00:00.000Z", endsAt: "2026-06-01T00:00:00.000Z" }))).toBe(false);
  });
});
