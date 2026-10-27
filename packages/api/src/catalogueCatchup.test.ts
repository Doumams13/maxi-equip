import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";

/**
 * Correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27), Phase 2 — test de bout en bout (vrai routeur) du
 * rattrapage proactif du catalogue : POST /v1/sync/push (entityType
 * "modele"/"produit", déjà existant) puis GET /v1/app/catalogue/list
 * (nouveau).
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-catalogue-catchup";
const MODELE_1 = "44444444-4444-4444-8444-444444444444";
const PRODUIT_1 = "55555555-5555-4555-8555-555555555555";

function tokenInstallation(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function push(operations: unknown[]) {
  return { method: "POST" as const, path: "/v1/sync/push", headers: { authorization: `Bearer ${tokenInstallation()}` }, body: { operations } };
}

function listerCatalogue() {
  return { method: "GET" as const, path: "/v1/app/catalogue/list", headers: { authorization: `Bearer ${tokenInstallation()}` } };
}

describe("Rattrapage proactif du catalogue — push + liste combinée (bout en bout)", () => {
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

  it("un modèle ET un produit poussés via /sync/push apparaissent ensemble dans /app/catalogue/list", async () => {
    const router = createRouter();
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }]))
    );
    await router.dispatch(
      req(
        push([
          {
            entityType: "produit",
            entityId: PRODUIT_1,
            payload: { operation: "create", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
        ])
      )
    );

    const res = await router.dispatch(req(listerCatalogue()));
    expect(res.status).toBe(200);
    const body = res.body as { modeles: { id: string }[]; produits: { id: string }[] };
    expect(body.modeles).toEqual(expect.arrayContaining([expect.objectContaining({ id: MODELE_1, motif: "Marbre Blanc" })]));
    expect(body.produits).toEqual(expect.arrayContaining([expect.objectContaining({ id: PRODUIT_1, reference: "MB-6060", prix: 15000 })]));
  });

  it("catalogue vide : renvoie deux tableaux vides, jamais une erreur", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(listerCatalogue()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ modeles: [], produits: [] });
  });

  it("sans jeton d'installation → 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "GET", path: "/v1/app/catalogue/list", headers: {} }));
    expect(res.status).toBe(401);
  });
});
