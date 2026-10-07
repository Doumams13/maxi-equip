import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-public-catalog";
const MODELE_1 = "11111111-1111-4111-8111-111111111111";
const MODELE_2 = "22222222-2222-4222-8222-222222222222";
const PRODUIT_1 = "33333333-3333-4333-8333-333333333333";
const PRODUIT_2 = "44444444-4444-4444-8444-444444444444";
const PROMO_1 = "55555555-5555-4555-8555-555555555555";

function tokenValide(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function push(operations: unknown[]) {
  return req({ method: "POST", path: "/v1/sync/push", headers: { authorization: `Bearer ${tokenValide()}` }, body: { operations } });
}

describe("Catalogue public — GET /v1/public/catalog/models, /v1/public/promotions, /v1/public/locations", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
  });

  async function seedCatalogueDeBase(router: ReturnType<typeof createRouter>) {
    await router.dispatch(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }]));
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "create", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000, updatedAt: "2026-01-01T00:00:00.000Z" } }])
    );
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_2, payload: { operation: "create", produitId: PRODUIT_2, modeleId: MODELE_1, taille: "40x40", tailleTri: 1600, largeur: 40, hauteur: 40, reference: "MB-4040", prix: 9500, updatedAt: "2026-01-01T00:00:00.000Z" } }])
    );
  }

  it("N — catalogue réel : un modèle avec deux variantes actives apparaît avec ses vraies données, jamais de stock", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);

    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    expect(res.status).toBe(200);
    const corps = res.body as { models: Record<string, unknown>[] };
    expect(corps.models).toHaveLength(1);
    const modele = corps.models[0]!;
    expect(modele).toMatchObject({ name: "Marbre Blanc", type: "Faïence", slug: "marbre-blanc" });
    expect((modele["variants"] as unknown[]).length).toBe(2);
    expect(JSON.stringify(modele)).not.toMatch(/stock|seuilAlerte|fournisseur|prixAchat/i);
  });

  it("ordreVitrine : poussé via sync, retrouvé tel quel dans le catalogue public (vitrine du site, 2026-10-07)", async () => {
    const router = createRouter();
    await router.dispatch(
      push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", ordreVitrine: 0, updatedAt: "2026-01-01T00:00:00.000Z" } }])
    );
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "create", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000, updatedAt: "2026-01-01T00:00:00.000Z" } }])
    );

    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const corps = res.body as { models: Record<string, unknown>[] };
    expect(corps.models[0]).toMatchObject({ ordreVitrine: 0 });
  });

  it("ordreVitrine : absent du payload (ancienne version de l'app) → null, jamais une erreur de validation", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }])
    );
    expect(res.status).toBe(200);
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "create", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000, updatedAt: "2026-01-01T00:00:00.000Z" } }])
    );

    const resCatalogue = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const corps = resCatalogue.body as { models: Record<string, unknown>[] };
    expect(corps.models[0]).toMatchObject({ ordreVitrine: null });
  });

  it("B — un modèle sans variante active n'apparaît jamais dans le catalogue public", async () => {
    const router = createRouter();
    await router.dispatch(push([{ entityType: "modele", entityId: MODELE_2, payload: { operation: "create", modeleId: MODELE_2, motif: "Sans variante", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }]));

    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const corps = res.body as { models: unknown[] };
    expect(corps.models).toHaveLength(0);
  });

  it("un modèle/variante supprimé disparaît immédiatement du catalogue public", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_2, payload: { operation: "delete", produitId: PRODUIT_2, modeleId: MODELE_1, taille: "40x40", tailleTri: 1600, largeur: 40, hauteur: 40, reference: "MB-4040", prix: 9500, updatedAt: "2026-01-02T00:00:00.000Z" } }])
    );
    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const corps = res.body as { models: { variants: unknown[] }[] };
    expect(corps.models[0]!.variants).toHaveLength(1);
  });

  it("AUDIT — un modèle supprimé (toutes ses variantes supprimées également, flux réel de catalogue:supprimerModele) disparaît ENTIÈREMENT du catalogue public — jamais une fiche vide", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);

    // Reproduit exactement le flux réel : chaque variante est supprimée AVANT le modèle (voir ipc/metier.ts catalogue:supprimerModele).
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "delete", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000, updatedAt: "2026-01-02T00:00:00.000Z" } }])
    );
    await router.dispatch(
      push([{ entityType: "produit", entityId: PRODUIT_2, payload: { operation: "delete", produitId: PRODUIT_2, modeleId: MODELE_1, taille: "40x40", tailleTri: 1600, largeur: 40, hauteur: 40, reference: "MB-4040", prix: 9500, updatedAt: "2026-01-02T00:00:00.000Z" } }])
    );
    await router.dispatch(
      push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "delete", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-02T00:00:00.000Z" } }])
    );

    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const corps = res.body as { models: { id: string }[] };
    expect(corps.models).toHaveLength(0);
    expect(corps.models.some((m) => m.id === MODELE_1)).toBe(false);
  });

  it("AUDIT — un modèle supprimé alors qu'une variante n'a pas ENCORE été marquée supprimée (désordre/incohérence) : le modèle disparaît quand même intégralement", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);

    // Seul le modèle est supprimé ici — cas défensif : le modèle ne doit
    // jamais réapparaître même si une variante techniquement active existe encore.
    await router.dispatch(
      push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "delete", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-02T00:00:00.000Z" } }])
    );

    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const corps = res.body as { models: { id: string }[] };
    expect(corps.models.some((m) => m.id === MODELE_1)).toBe(false);
  });

  it("AUDIT — une image supprimée disparaît du modèle, sans affecter la visibilité du modèle lui-même", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);

    const IMAGE_1 = "66666666-6666-4666-8666-666666666666";
    const PNG_1PX_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const imageReq = (body: Record<string, unknown>) =>
      req({ method: "POST", path: "/v1/app/images/sync", headers: { authorization: `Bearer ${tokenValide()}` }, body });

    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );

    const avantSuppression = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const modeleAvant = (avantSuppression.body as { models: { id: string; images: unknown[] }[] }).models.find((m) => m.id === MODELE_1)!;
    expect(modeleAvant.images).toHaveLength(1);

    await router.dispatch(
      imageReq({ operation: "delete", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, updatedAt: "2026-01-02T00:00:00.000Z" })
    );

    const apresSuppression = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const modeleApres = (apresSuppression.body as { models: { id: string; images: unknown[] }[] }).models.find((m) => m.id === MODELE_1)!;
    expect(modeleApres.images).toHaveLength(0);
    // Le modèle lui-même reste visible — seule l'image a disparu.
    expect(modeleApres).toBeDefined();
  });

  it("H/N — promotion ciblée : prix promotionnel correctement calculé (pourcentage) et exposé uniquement pour la variante ciblée", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);
    await router.dispatch(
      push([
        {
          entityType: "promotion",
          entityId: PROMO_1,
          payload: {
            operation: "create",
            promotionId: PROMO_1,
            libelle: "Soldes",
            typeReduction: "pourcentage",
            valeur: 20,
            perimetre: "cible",
            produitIds: [PRODUIT_1],
            dateDebut: "2026-01-01T00:00:00.000Z",
            dateFin: "2026-12-31T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ])
    );

    const res = await router.dispatch(req({ path: "/v1/public/promotions" }));
    const corps = res.body as { promotions: { variantId: string; promoPriceFcfa: number }[] };
    expect(corps.promotions).toHaveLength(1);
    expect(corps.promotions[0]).toMatchObject({ variantId: PRODUIT_1, promoPriceFcfa: 12000 }); // 15000 * 0.8
  });

  it("promotion globale : fanout sur toutes les variantes actives", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);
    await router.dispatch(
      push([
        {
          entityType: "promotion",
          entityId: PROMO_1,
          payload: {
            operation: "create",
            promotionId: PROMO_1,
            libelle: "Soldes globales",
            typeReduction: "montant_fixe",
            valeur: 1000,
            perimetre: "global",
            produitIds: [],
            dateDebut: "2026-01-01T00:00:00.000Z",
            dateFin: "2026-12-31T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ])
    );
    const res = await router.dispatch(req({ path: "/v1/public/promotions" }));
    const corps = res.body as { promotions: { variantId: string; promoPriceFcfa: number }[] };
    expect(corps.promotions).toHaveLength(2);
    const parVariante = Object.fromEntries(corps.promotions.map((p) => [p.variantId, p.promoPriceFcfa]));
    expect(parVariante[PRODUIT_1]).toBe(14000);
    expect(parVariante[PRODUIT_2]).toBe(8500);
  });

  it("promotion expirée : toujours renvoyée (le filtrage par date reste une responsabilité du site)", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);
    await router.dispatch(
      push([
        {
          entityType: "promotion",
          entityId: PROMO_1,
          payload: {
            operation: "create",
            promotionId: PROMO_1,
            libelle: "Expirée",
            typeReduction: "pourcentage",
            valeur: 10,
            perimetre: "cible",
            produitIds: [PRODUIT_1],
            dateDebut: "2020-01-01T00:00:00.000Z",
            dateFin: "2020-01-31T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ])
    );
    const res = await router.dispatch(req({ path: "/v1/public/promotions" }));
    expect((res.body as { promotions: unknown[] }).promotions).toHaveLength(1);
  });

  it("L — le catalogue public ne contient jamais de champ 'stock' à aucun niveau (garantie structurelle)", async () => {
    const router = createRouter();
    await seedCatalogueDeBase(router);
    const res = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    expect(JSON.stringify(res.body)).not.toMatch(/stock/i);
  });

  it("locations : renvoie les trois emplacements, SHOP comme seul point de vente", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/public/locations" }));
    expect(res.status).toBe(200);
    const corps = res.body as { locations: { kind: string }[] };
    expect(corps.locations).toHaveLength(3);
    expect(corps.locations.filter((l) => l.kind === "point_de_vente")).toHaveLength(1);
  });

  it("catalogue et promotions publics : accessibles sans authentification", async () => {
    const router = createRouter();
    const res1 = await router.dispatch(req({ path: "/v1/public/catalog/models" }));
    const res2 = await router.dispatch(req({ path: "/v1/public/promotions" }));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
