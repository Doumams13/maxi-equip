import { describe, expect, it } from "vitest";
import { getEffectivePrice, assertValidPromotion, calculerPrixApresReduction, InvalidPromotionError } from "./getEffectivePrice.js";

describe("calculerPrixApresReduction", () => {
  it("applique un pourcentage", () => {
    expect(calculerPrixApresReduction(10000, "pourcentage", 20)).toBe(8000);
  });

  it("applique un montant fixe", () => {
    expect(calculerPrixApresReduction(10000, "montant_fixe", 1500)).toBe(8500);
  });

  it("arrondit pour les pourcentages", () => {
    expect(calculerPrixApresReduction(8500, "pourcentage", 10)).toBe(7650);
  });

  it("ne descend jamais en dessous de 1 FCFA", () => {
    expect(calculerPrixApresReduction(100, "montant_fixe", 5000)).toBe(1);
    expect(calculerPrixApresReduction(100, "pourcentage", 100)).toBe(1);
  });
});

describe("getEffectivePrice", () => {
  const produit = { prix: 8500 };
  const promoId = "promo-1";

  it("retourne le prix catalogue quand aucune promotion n'est active", () => {
    const result = getEffectivePrice(produit, [], "2026-06-01T00:00:00.000Z");
    expect(result.price).toBe(8500);
    expect(result.isPromoActive).toBe(false);
    expect(result.promotionId).toBeNull();
  });

  it("retourne le prix réduit quand une promotion pourcentage est active", () => {
    const promotions = [
      { id: promoId, typeReduction: "pourcentage" as const, valeur: 20, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.price).toBe(6800); // 8500 * 0.80
    expect(result.isPromoActive).toBe(true);
    expect(result.originalPrice).toBe(8500);
    expect(result.promotionId).toBe(promoId);
  });

  it("retourne le prix réduit quand une promotion montant_fixe est active", () => {
    const promotions = [
      { id: promoId, typeReduction: "montant_fixe" as const, valeur: 1500, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.price).toBe(7000);
    expect(result.isPromoActive).toBe(true);
    expect(result.promotionId).toBe(promoId);
  });

  it("ignore une promotion expirée", () => {
    const promotions = [
      { id: promoId, typeReduction: "pourcentage" as const, valeur: 20, dateDebut: "2026-01-01T00:00:00.000Z", dateFin: "2026-01-31T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.isPromoActive).toBe(false);
  });

  it("ignore une promotion future", () => {
    const promotions = [
      { id: promoId, typeReduction: "pourcentage" as const, valeur: 20, dateDebut: "2027-01-01T00:00:00.000Z", dateFin: "2027-01-31T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.isPromoActive).toBe(false);
    expect(result.price).toBe(8500);
  });

  it("retient la promotion la plus avantageuse quand plusieurs sont actives", () => {
    const promotions = [
      { id: "promo-a", typeReduction: "pourcentage" as const, valeur: 10, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T23:59:59.000Z" },
      { id: "promo-b", typeReduction: "pourcentage" as const, valeur: 25, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.promotionId).toBe("promo-b");
    expect(result.price).toBe(Math.round(8500 * 0.75));
  });

  it("ne modifie jamais le prix catalogue d'origine (règle métier critique)", () => {
    const promotions = [
      { id: promoId, typeReduction: "pourcentage" as const, valeur: 50, dateDebut: "2026-01-01T00:00:00.000Z", dateFin: "2026-12-31T23:59:59.000Z" },
    ];
    getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(produit.prix).toBe(8500);
  });
});

describe("assertValidPromotion", () => {
  it("accepte une promotion pourcentage valide", () => {
    expect(() =>
      assertValidPromotion({ typeReduction: "pourcentage", valeur: 20, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).not.toThrow();
  });

  it("accepte une promotion montant_fixe valide", () => {
    expect(() =>
      assertValidPromotion({ typeReduction: "montant_fixe", valeur: 1000, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).not.toThrow();
  });

  it("rejette une valeur nulle ou négative", () => {
    expect(() =>
      assertValidPromotion({ typeReduction: "pourcentage", valeur: 0, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
    expect(() =>
      assertValidPromotion({ typeReduction: "montant_fixe", valeur: -100, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
  });

  it("rejette un pourcentage supérieur à 100", () => {
    expect(() =>
      assertValidPromotion({ typeReduction: "pourcentage", valeur: 101, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
  });

  it("rejette une période invalide", () => {
    expect(() =>
      assertValidPromotion({ typeReduction: "pourcentage", valeur: 10, dateDebut: "2026-06-30T00:00:00.000Z", dateFin: "2026-06-01T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
    expect(() =>
      assertValidPromotion({ typeReduction: "pourcentage", valeur: 10, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-01T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
  });
});
