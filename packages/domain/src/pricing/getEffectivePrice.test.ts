import { describe, expect, it } from "vitest";
import { getEffectivePrice, assertValidPromotion, InvalidPromotionError } from "./getEffectivePrice.js";

describe("getEffectivePrice (Phase 0 — preuve de fonctionnement du domaine)", () => {
  const produit = { prix: 8500 };

  it("retourne le prix catalogue quand aucune promotion n'est active", () => {
    const result = getEffectivePrice(produit, [], "2026-06-01T00:00:00.000Z");
    expect(result.price).toBe(8500);
    expect(result.isPromoActive).toBe(false);
  });

  it("retourne le prix promotionnel quand une promotion est active à la date donnée", () => {
    const promotions = [
      { prixPromotionnel: 6900, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.price).toBe(6900);
    expect(result.isPromoActive).toBe(true);
    expect(result.originalPrice).toBe(8500);
  });

  it("ignore une promotion expirée", () => {
    const promotions = [
      { prixPromotionnel: 6900, dateDebut: "2026-01-01T00:00:00.000Z", dateFin: "2026-01-31T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.isPromoActive).toBe(false);
  });

  it("ne modifie jamais le prix catalogue d'origine (règle métier critique)", () => {
    const promotions = [
      { prixPromotionnel: 1, dateDebut: "2026-01-01T00:00:00.000Z", dateFin: "2026-12-31T23:59:59.000Z" },
    ];
    getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(produit.prix).toBe(8500);
  });

  it("retourne le prix catalogue quand une promotion future n'a pas encore commencé", () => {
    const promotions = [
      { prixPromotionnel: 5000, dateDebut: "2027-01-01T00:00:00.000Z", dateFin: "2027-01-31T23:59:59.000Z" },
    ];
    const result = getEffectivePrice(produit, promotions, "2026-06-15T12:00:00.000Z");
    expect(result.isPromoActive).toBe(false);
    expect(result.price).toBe(8500);
  });
});

describe("assertValidPromotion (Phase 1)", () => {
  it("accepte une promotion valide", () => {
    expect(() =>
      assertValidPromotion({ prixPromotionnel: 6900, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).not.toThrow();
  });

  it("rejette un prix promotionnel nul ou négatif", () => {
    expect(() =>
      assertValidPromotion({ prixPromotionnel: 0, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
    expect(() =>
      assertValidPromotion({ prixPromotionnel: -100, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-30T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
  });

  it("rejette une période invalide (fin avant ou égale au début)", () => {
    expect(() =>
      assertValidPromotion({ prixPromotionnel: 5000, dateDebut: "2026-06-30T00:00:00.000Z", dateFin: "2026-06-01T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
    expect(() =>
      assertValidPromotion({ prixPromotionnel: 5000, dateDebut: "2026-06-01T00:00:00.000Z", dateFin: "2026-06-01T00:00:00.000Z" })
    ).toThrow(InvalidPromotionError);
  });
});
