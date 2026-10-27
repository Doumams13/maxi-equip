import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";

/**
 * Correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27), Phase 1 — tests de bout en bout (vrai routeur) du
 * rattrapage proactif des comptes : POST /v1/sync/push (entityType
 * "compte") puis GET /v1/app/comptes/list.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-comptes-catchup";
const COMPTE_1 = "99999999-9999-4999-8999-999999999999";
const COMPTE_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function tokenInstallation(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function pushCompte(payload: Record<string, unknown>) {
  return {
    method: "POST" as const,
    path: "/v1/sync/push",
    headers: { authorization: `Bearer ${tokenInstallation()}` },
    body: { operations: [{ entityType: "compte", entityId: payload["compteId"], payload }] },
  };
}

function listerComptes() {
  return { method: "GET" as const, path: "/v1/app/comptes/list", headers: { authorization: `Bearer ${tokenInstallation()}` } };
}

describe("Rattrapage proactif des comptes — push + liste (bout en bout)", () => {
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

  function compte(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      operation: "create",
      compteId: COMPTE_1,
      identifiant: "vendeur.test",
      hashMotDePasse: "$argon2id$hash-quelconque",
      nom: "Awa Ndiaye",
      role: "gerant",
      actif: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("un compte poussé via /sync/push apparaît dans /app/comptes/list SANS le hash de mot de passe", async () => {
    const router = createRouter();
    await router.dispatch(req(pushCompte(compte())));

    const res = await router.dispatch(req(listerComptes()));
    expect(res.status).toBe(200);
    const comptes = (res.body as { comptes: Record<string, unknown>[] }).comptes;
    expect(comptes).toEqual([{ id: COMPTE_1, identifiant: "vendeur.test", nom: "Awa Ndiaye", role: "gerant", actif: true }]);
    expect(comptes[0]).not.toHaveProperty("hashMotDePasse");
  });

  it("un compte désactivé (actif: false) apparaît quand même dans la liste, avec actif à false — jamais filtré", async () => {
    const router = createRouter();
    await router.dispatch(req(pushCompte(compte({ actif: false }))));

    const res = await router.dispatch(req(listerComptes()));
    const comptes = (res.body as { comptes: { actif: boolean }[] }).comptes;
    expect(comptes[0]!.actif).toBe(false);
  });

  it("un compte 'delete' n'apparaît plus dans la liste", async () => {
    const router = createRouter();
    await router.dispatch(req(pushCompte(compte())));
    await router.dispatch(req(pushCompte(compte({ operation: "delete", updatedAt: "2026-01-02T00:00:00.000Z" }))));

    const res = await router.dispatch(req(listerComptes()));
    expect((res.body as { comptes: unknown[] }).comptes).toEqual([]);
  });

  it("plusieurs comptes distincts coexistent dans la liste", async () => {
    const router = createRouter();
    await router.dispatch(req(pushCompte(compte())));
    await router.dispatch(req(pushCompte(compte({ compteId: COMPTE_2, identifiant: "admin.test", role: "administrateur" }))));

    const res = await router.dispatch(req(listerComptes()));
    expect((res.body as { comptes: unknown[] }).comptes).toHaveLength(2);
  });

  it("sans jeton d'installation → 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "GET", path: "/v1/app/comptes/list", headers: {} }));
    expect(res.status).toBe(401);
  });
});
