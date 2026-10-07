import { describe, it, expect, vi, afterEach } from "vitest";
import type { ProductModel, Promotion } from "@/lib/types/catalog";

/**
 * Tests de l'implémentation réelle du catalogue — correction
 * "Intégration Site Phase 5, Partie 3". `fetch` est simulé (aucun vrai
 * réseau) mais le contrat HTTP exact attendu de l'API est vérifié, ainsi
 * que la réutilisation de la même logique de filtrage/tri que le mock
 * (`applyFiltersAndSort`), et la stratégie de repli (§7 : catalogue
 * consultable avec la dernière donnée connue si l'API est indisponible).
 *
 * `ApiCatalogRepository` garde un instantané en mémoire DE MODULE —
 * chaque test qui dépend de l'état de cet instantané (vide ou déjà
 * rempli) réimporte donc le module via `vi.resetModules()`, pour ne
 * jamais dépendre de l'ordre d'exécution des tests entre eux.
 */

const MODELE_A: ProductModel = {
  id: "m1",
  slug: "marbre-blanc",
  name: "Marbre Blanc",
  type: "Faïence",
  description: "",
  images: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [{ id: "v1", size: "60x60", reference: "MB-6060", priceFcfa: 15000 }],
  ordreVitrine: null,
};

const MODELE_B: ProductModel = {
  id: "m2",
  slug: "gres-anthracite",
  name: "Grès Anthracite",
  type: "Grès cérame",
  description: "",
  images: [],
  updatedAt: "2026-01-02T00:00:00.000Z",
  variants: [{ id: "v2", size: "30x30", reference: "GA-3030", priceFcfa: 8000 }],
  ordreVitrine: null,
};

function stubFetchOk(models: ProductModel[], promotions: Promotion[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/catalog/models")) return new Response(JSON.stringify({ models }), { status: 200 });
      if (url.includes("/promotions")) return new Response(JSON.stringify({ promotions }), { status: 200 });
      throw new Error(`URL inattendue dans le test : ${url}`);
    })
  );
}

async function freshRepository(baseUrl = "http://api.test") {
  vi.resetModules();
  const { ApiCatalogRepository } = await import("./apiCatalogRepository");
  return new ApiCatalogRepository(baseUrl);
}

describe("ApiCatalogRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listModels : appelle les bons endpoints et applique le même filtrage/tri que le mock", async () => {
    stubFetchOk([MODELE_A, MODELE_B], []);
    const repo = await freshRepository();
    const resultats = await repo.listModels({ type: "Faïence" }, "name_asc");
    expect(resultats).toHaveLength(1);
    expect(resultats[0]!.slug).toBe("marbre-blanc");
  });

  it("getModelBySlug : trouve le bon modèle parmi la liste complète", async () => {
    stubFetchOk([MODELE_A, MODELE_B], []);
    const repo = await freshRepository();
    const modele = await repo.getModelBySlug("gres-anthracite");
    expect(modele?.name).toBe("Grès Anthracite");
  });

  it("getModelBySlug : renvoie null si aucun modèle ne correspond", async () => {
    stubFetchOk([MODELE_A], []);
    const repo = await freshRepository();
    expect(await repo.getModelBySlug("inexistant")).toBeNull();
  });

  it("listAvailableTypes/listAvailableSizes : dérivés de la liste complète, sans appel API supplémentaire", async () => {
    stubFetchOk([MODELE_A, MODELE_B], []);
    const repo = await freshRepository();
    expect(await repo.listAvailableTypes()).toEqual(["Faïence", "Grès cérame"]);
    expect(await repo.listAvailableSizes()).toEqual(["30x30", "60x60"]);
  });

  it("listPromotions : relaie telles quelles les promotions renvoyées par l'API", async () => {
    const promo: Promotion = { id: "p1", productModelId: "m1", variantId: "v1", promoPriceFcfa: 12000, startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-01-31T00:00:00.000Z" };
    stubFetchOk([MODELE_A], [promo]);
    const repo = await freshRepository();
    expect(await repo.listPromotions()).toEqual([promo]);
  });

  it("API indisponible dès le premier appel (aucun instantané connu) : l'erreur remonte, jamais masquée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const repo = await freshRepository();
    await expect(repo.listModels({}, "relevance")).rejects.toThrow();
  });

  it("§7 — API indisponible APRÈS un succès préalable : sert le dernier catalogue connu plutôt que d'échouer", async () => {
    stubFetchOk([MODELE_A], []);
    const repo = await freshRepository();
    const premierAppel = await repo.listModels({}, "relevance");
    expect(premierAppel).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const deuxiemeAppel = await repo.listModels({}, "relevance");
    expect(deuxiemeAppel).toHaveLength(1);
    expect(deuxiemeAppel[0]!.slug).toBe("marbre-blanc");
  });

  it("§7 — même repli en cas d'erreur réseau (fetch qui rejette, pas seulement une réponse HTTP en erreur)", async () => {
    stubFetchOk([MODELE_A], []);
    const repo = await freshRepository();
    await repo.listModels({}, "relevance");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const resultat = await repo.listModels({}, "relevance");
    expect(resultat).toHaveLength(1);
  });
});
