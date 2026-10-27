import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";

/**
 * Correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27), Phase 0a — tests de bout en bout (vrai routeur, voir
 * comptesEtOperationsStock.test.ts pour le même principe côté comptes)
 * de la centralisation des dépôts : POST /v1/sync/push (entityType
 * "emplacement") puis GET /v1/app/emplacements/list.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-emplacements";
const DEPOT_AKEBE = "77777777-7777-4777-8777-777777777777";
const DEPOT_SHOP = "88888888-8888-4888-8888-888888888888";

function tokenInstallation(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function pushEmplacement(payload: Record<string, unknown>) {
  return {
    method: "POST" as const,
    path: "/v1/sync/push",
    headers: { authorization: `Bearer ${tokenInstallation()}` },
    body: { operations: [{ entityType: "emplacement", entityId: payload["emplacementId"], payload }] },
  };
}

function listerEmplacements() {
  return { method: "GET" as const, path: "/v1/app/emplacements/list", headers: { authorization: `Bearer ${tokenInstallation()}` } };
}

describe("Centralisation des dépôts — push + liste (bout en bout)", () => {
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

  function depot(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      operation: "create",
      emplacementId: DEPOT_AKEBE,
      nom: "Akébé",
      type: "depot",
      ville: "Libreville",
      estPointDeVente: false,
      actif: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("un dépôt poussé via /sync/push apparaît ensuite dans /app/emplacements/list", async () => {
    const router = createRouter();
    const resPush = await router.dispatch(req(pushEmplacement(depot())));
    expect(resPush.status).toBe(200);

    const resListe = await router.dispatch(req(listerEmplacements()));
    expect(resListe.status).toBe(200);
    expect((resListe.body as { emplacements: unknown[] }).emplacements).toEqual([
      { id: DEPOT_AKEBE, nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: true },
    ]);
  });

  it("un renommage (update) ultérieur remplace le nom, jamais une seconde ligne", async () => {
    const router = createRouter();
    await router.dispatch(req(pushEmplacement(depot())));
    await router.dispatch(req(pushEmplacement(depot({ operation: "update", nom: "Akébé 2", updatedAt: "2026-01-02T00:00:00.000Z" }))));

    const res = await router.dispatch(req(listerEmplacements()));
    const emplacements = (res.body as { emplacements: { nom: string }[] }).emplacements;
    expect(emplacements).toHaveLength(1);
    expect(emplacements[0]!.nom).toBe("Akébé 2");
  });

  it("une mise à jour PLUS ANCIENNE (updatedAt antérieur) est ignorée — jamais d'écrasement par une donnée périmée", async () => {
    const router = createRouter();
    await router.dispatch(req(pushEmplacement(depot({ nom: "Récent", updatedAt: "2026-01-05T00:00:00.000Z" }))));
    await router.dispatch(req(pushEmplacement(depot({ nom: "Périmé", updatedAt: "2026-01-01T00:00:00.000Z" }))));

    const res = await router.dispatch(req(listerEmplacements()));
    const emplacements = (res.body as { emplacements: { nom: string }[] }).emplacements;
    expect(emplacements[0]!.nom).toBe("Récent");
  });

  it("une suppression (delete) retire le dépôt de la liste", async () => {
    const router = createRouter();
    await router.dispatch(req(pushEmplacement(depot())));
    await router.dispatch(req(pushEmplacement(depot({ operation: "delete", updatedAt: "2026-01-02T00:00:00.000Z" }))));

    const res = await router.dispatch(req(listerEmplacements()));
    expect((res.body as { emplacements: unknown[] }).emplacements).toEqual([]);
  });

  it("plusieurs dépôts distincts coexistent dans la liste", async () => {
    const router = createRouter();
    await router.dispatch(req(pushEmplacement(depot())));
    await router.dispatch(req(pushEmplacement(depot({ emplacementId: DEPOT_SHOP, nom: "SHOP", type: "shop", estPointDeVente: true }))));

    const res = await router.dispatch(req(listerEmplacements()));
    expect((res.body as { emplacements: unknown[] }).emplacements).toHaveLength(2);
  });

  it("type invalide (ni 'shop' ni 'depot') → 400", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(pushEmplacement(depot({ type: "entrepot" }))));
    expect(res.status).toBe(400);
  });

  it("sans jeton d'installation → 401, aussi bien pour push que pour list", async () => {
    const router = createRouter();
    const resPush = await router.dispatch(req({ method: "POST", path: "/v1/sync/push", headers: {}, body: { operations: [] } }));
    expect(resPush.status).toBe(401);
    const resListe = await router.dispatch(req({ method: "GET", path: "/v1/app/emplacements/list", headers: {} }));
    expect(resListe.status).toBe(401);
  });
});
