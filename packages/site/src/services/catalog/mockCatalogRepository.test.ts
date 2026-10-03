import { describe, it, expect } from "vitest";
import { MockCatalogRepository } from "./mockCatalogRepository";
import { getModelDisplayPrice } from "@/lib/pricing";

describe("MockCatalogRepository — filtre 'Uniquement les promotions' (ex-Défaut 3, corrigé, données réelles)", () => {
  it("'Marbre Blanc' (Faïence) apparaît bien dans le filtre promotions : son 60x60 est en promotion, même si ce n'est pas sa variante la moins chère (40x40)", async () => {
    const repo = new MockCatalogRepository();
    const resultats = await repo.listModels({ onlyPromotions: true }, "relevance");
    expect(resultats.some((m) => m.slug === "marbre-blanc")).toBe(true);
  });

  it("'Terracotta' (promotion sur toutes les tailles) reste bien inclus : sa variante affichée est nécessairement en promotion", async () => {
    const repo = new MockCatalogRepository();
    const resultats = await repo.listModels({ onlyPromotions: true }, "relevance");
    expect(resultats.some((m) => m.slug === "terracotta-antiderapant")).toBe(true);
  });

  it("chaque modèle retourné par le filtre affiche réellement un prix promotionnel actif via getModelDisplayPrice — jamais un modèle sans badge visible", async () => {
    const repo = new MockCatalogRepository();
    const resultats = await repo.listModels({ onlyPromotions: true }, "relevance");
    const promotions = await repo.listPromotions();

    expect(resultats.length).toBeGreaterThan(0);
    for (const modele of resultats) {
      const { effective } = getModelDisplayPrice(modele.variants, promotions, modele.id);
      expect(effective.isPromotionActive).toBe(true);
    }
  });

  it("une promotion expirée (grès anthracite) ou future (beige sable) n'inclut jamais son modèle", async () => {
    const repo = new MockCatalogRepository();
    const resultats = await repo.listModels({ onlyPromotions: true }, "relevance");
    expect(resultats.some((m) => m.slug === "gres-gris-anthracite")).toBe(false);
    expect(resultats.some((m) => m.slug === "beige-sable-faience")).toBe(false);
  });
});

describe("MockCatalogRepository — tri (Défaut 1 : plus de tri par prix)", () => {
  it("les tris restants fonctionnent normalement après le retrait de price_asc/price_desc", async () => {
    const repo = new MockCatalogRepository();
    const resultats = await repo.listModels({}, "name_asc");
    const noms = resultats.map((m) => m.name);
    const triesAlphabetiquement = [...noms].sort((a, b) => a.localeCompare(b, "fr"));
    expect(noms).toEqual(triesAlphabetiquement);
  });
});
