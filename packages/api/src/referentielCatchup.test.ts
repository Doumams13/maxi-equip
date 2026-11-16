import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur, getStorage } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.2 — test de bout en bout
 * (vrai routeur) de la route de lecture GET /v1/app/referentiel/list.
 *
 * Portée STRICTEMENT limitée à la 5.2 : les données sont matérialisées
 * directement via les méthodes `ServerStorage` (comme en sous-phase 5.1),
 * JAMAIS via POST /v1/sync/push — ce chemin n'est routé pour ces 3
 * entités qu'à partir de la sous-phase 5.3, testée séparément dans
 * referentielPush.test.ts une fois celle-ci livrée.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-referentiel-catchup";
const CATEGORIE_1 = "11111111-1111-4111-8111-111111111111";
const SOUS_CATEGORIE_1 = "22222222-2222-4222-8222-222222222222";
const CHAMP_1 = "33333333-3333-4333-8333-333333333333";

function tokenInstallation(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function listerReferentiel(sansAuth = false) {
  return { method: "GET" as const, path: "/v1/app/referentiel/list", headers: sansAuth ? {} : { authorization: `Bearer ${tokenInstallation()}` } };
}

describe("GET /v1/app/referentiel/list — Phase 5, sous-phase 5.2", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
    // Phase 5 (référentiel commun), sous-phase 5.8, chantier E — voir le commentaire équivalent dans catalogSync.test.ts.
    reinitialiserLimitationPourTests();
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
  });

  it("sans authentification → 401, jamais les données", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(listerReferentiel(true)));
    expect(res.status).toBe(401);
  });

  it("base vide : renvoie trois tableaux vides, jamais une erreur", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(listerReferentiel()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [], sousCategories: [], sousCategorieChamps: [] });
  });

  it("avec des données : les trois collections sont correctement retournées, y compris la configuration d'unités en sous-objet de la sous-catégorie", async () => {
    await getStorage().appliquerOperationCategorie({
      operation: "create",
      categorieId: CATEGORIE_1,
      nom: "Quincaillerie générale",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await getStorage().appliquerOperationSousCategorie({
      operation: "create",
      sousCategorieId: SOUS_CATEGORIE_1,
      categorieId: CATEGORIE_1,
      nom: "Ciments et liants",
      ordre: 0,
      modelePhysique: null,
      unitesAutorisees: ["sac", "kg"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await getStorage().appliquerOperationSousCategorieChamp({
      operation: "create",
      champId: CHAMP_1,
      sousCategorieId: SOUS_CATEGORIE_1,
      nom: "Poids",
      type: "nombre",
      obligatoire: true,
      valeursAutorisees: null,
      uniteMesure: "kg",
      role: "physique",
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const router = createRouter();
    const res = await router.dispatch(req(listerReferentiel()));
    expect(res.status).toBe(200);
    const body = res.body as {
      categories: { id: string }[];
      sousCategories: { id: string; unitesAutorisees: string[] | null }[];
      sousCategorieChamps: { id: string }[];
    };
    expect(body.categories).toEqual(expect.arrayContaining([expect.objectContaining({ id: CATEGORIE_1, nom: "Quincaillerie générale" })]));
    expect(body.sousCategories).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: SOUS_CATEGORIE_1, categorieId: CATEGORIE_1, unitesAutorisees: ["sac", "kg"] })])
    );
    expect(body.sousCategorieChamps).toEqual(expect.arrayContaining([expect.objectContaining({ id: CHAMP_1, nom: "Poids", obligatoire: true })]));
  });

  it("Phase 5 (référentiel commun), sous-phase 5.6 — une catégorie supprimée (tombstone) EST DÉSORMAIS retournée, avec deletedAt renseigné", async () => {
    await getStorage().appliquerOperationCategorie({
      operation: "create",
      categorieId: CATEGORIE_1,
      nom: "À supprimer",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await getStorage().appliquerOperationCategorie({
      operation: "delete",
      categorieId: CATEGORIE_1,
      nom: "À supprimer",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const router = createRouter();
    const res = await router.dispatch(req(listerReferentiel()));
    const body = res.body as { categories: { id: string; deletedAt: string | null }[] };
    const categorie = body.categories.find((c) => c.id === CATEGORIE_1);
    expect(categorie).toBeDefined();
    expect(categorie!.deletedAt).not.toBeNull();
  });

  it("Phase 5 (référentiel commun), sous-phase 5.6 — une sous-catégorie et un champ supprimés (tombstone) SONT DÉSORMAIS retournés, avec deletedAt renseigné (nécessaire pour que les autres postes reçoivent la suppression)", async () => {
    await getStorage().appliquerOperationSousCategorie({
      operation: "create",
      sousCategorieId: SOUS_CATEGORIE_1,
      categorieId: CATEGORIE_1,
      nom: "À supprimer",
      ordre: 0,
      modelePhysique: null,
      unitesAutorisees: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await getStorage().appliquerOperationSousCategorie({
      operation: "delete",
      sousCategorieId: SOUS_CATEGORIE_1,
      categorieId: CATEGORIE_1,
      nom: "À supprimer",
      ordre: 0,
      modelePhysique: null,
      unitesAutorisees: null,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    await getStorage().appliquerOperationSousCategorieChamp({
      operation: "create",
      champId: CHAMP_1,
      sousCategorieId: SOUS_CATEGORIE_1,
      nom: "À supprimer",
      type: "texte",
      obligatoire: false,
      valeursAutorisees: null,
      uniteMesure: null,
      role: null,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await getStorage().appliquerOperationSousCategorieChamp({
      operation: "delete",
      champId: CHAMP_1,
      sousCategorieId: SOUS_CATEGORIE_1,
      nom: "À supprimer",
      type: "texte",
      obligatoire: false,
      valeursAutorisees: null,
      uniteMesure: null,
      role: null,
      ordre: 0,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const router = createRouter();
    const res = await router.dispatch(req(listerReferentiel()));
    const body = res.body as { sousCategories: { id: string; deletedAt: string | null }[]; sousCategorieChamps: { id: string; deletedAt: string | null }[] };
    const sousCategorieRecue = body.sousCategories.find((s) => s.id === SOUS_CATEGORIE_1);
    const champRecu = body.sousCategorieChamps.find((c) => c.id === CHAMP_1);
    expect(sousCategorieRecue).toBeDefined();
    expect(sousCategorieRecue!.deletedAt).not.toBeNull();
    expect(champRecu).toBeDefined();
    expect(champRecu!.deletedAt).not.toBeNull();
  });

  it("aucune écriture en base depuis cette route : deux appels successifs renvoient exactement le même état", async () => {
    await getStorage().appliquerOperationCategorie({
      operation: "create",
      categorieId: CATEGORIE_1,
      nom: "Stable",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const router = createRouter();
    const premier = await router.dispatch(req(listerReferentiel()));
    const second = await router.dispatch(req(listerReferentiel()));
    expect(second.body).toEqual(premier.body);
    // Confirmation directe au niveau stockage : une seule ligne, jamais dupliquée par la lecture.
    const categories = await getStorage().listerCategoriesActives();
    expect(categories).toHaveLength(1);
  });
});
