import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

// Secret déterministe pour tous les tests de ce fichier — jamais le
// secret réel de développement/production (voir core/config.ts),
// jamais un test qui dépend d'une variable d'environnement externe.
const SECRET_TEST = "secret-de-test-router";

describe("Router (Phase 0 — socle API)", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
  });

  it("TEST 1 — route publique : répond 200 sans authentification", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/public/health" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: "public" });
  });

  it("TEST 2 — route protégée sans jeton : 401, aucun détail sensible exposé", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/app/health" }));
    expect(res.status).toBe(401);
    const corpsSerialise = JSON.stringify(res.body);
    expect(corpsSerialise).not.toContain(SECRET_TEST);
    expect(corpsSerialise.toLowerCase()).not.toContain("stack");
  });

  it("TEST 3 — jeton JWT réellement valide : accès autorisé, informations du sujet disponibles", async () => {
    const router = createRouter();
    const token = signerJwt({ sub: "installation-test-1", role: "app" }, SECRET_TEST, 3600);
    const res = await router.dispatch(req({ path: "/v1/app/health", headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: "app", sub: "installation-test-1" });
  });

  it("TEST 4 — jeton invalide (chaîne arbitraire, plus jamais accepté) : 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/app/health", headers: { authorization: "Bearer un-jeton-quelconque-invente" } }));
    expect(res.status).toBe(401);
  });

  it("Phase Finale — GET /health (non versionné, non préfixé) : 200, réponse minimale, jamais authentifié", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/health" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("Phase Finale — GET /health n'expose aucune information sensible", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/health" }));
    const serialise = JSON.stringify(res.body);
    expect(serialise.toLowerCase()).not.toMatch(/database|secret|jwt|stack|error/);
  });

  it("TEST 5 — jeton falsifié (payload modifié après signature) : signature rejetée, 401", async () => {
    const router = createRouter();
    const token = signerJwt({ sub: "installation-1", role: "app" }, SECRET_TEST, 3600);
    const [entete, , signature] = token.split(".");
    const payloadUsurpe = Buffer.from(JSON.stringify({ sub: "installation-1", role: "administrateur-usurpe" })).toString("base64url");
    const tokenFalsifie = `${entete}.${payloadUsurpe}.${signature}`;
    const res = await router.dispatch(req({ path: "/v1/app/health", headers: { authorization: `Bearer ${tokenFalsifie}` } }));
    expect(res.status).toBe(401);
  });

  it("TEST 6 — jetons malformés : refus propre, 401, jamais de crash", async () => {
    const router = createRouter();

    const casMalformes = ["Bearer", "Bearer ", "TotalementAutreChose xyz", "Bearer a.b", "Bearer texte-aleatoire-sans-points"];

    for (const authorization of casMalformes) {
      const res = await router.dispatch(req({ path: "/v1/app/health", headers: { authorization } }));
      expect(res.status).toBe(401);
    }

    const resSansEnTete = await router.dispatch(req({ path: "/v1/app/health", headers: {} }));
    expect(resSansEnTete.status).toBe(401);
  });

  it("TEST 7 — jeton expiré : refus, 401", async () => {
    const router = createRouter();
    const tokenExpire = signerJwt({ sub: "installation-1", role: "app" }, SECRET_TEST, -60);
    const res = await router.dispatch(req({ path: "/v1/app/health", headers: { authorization: `Bearer ${tokenExpire}` } }));
    expect(res.status).toBe(401);
  });

  it("rejette un chemin sans préfixe de version /v1", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/public/health" }));
    expect(res.status).toBe(404);
  });

  it("renvoie une 404 avec un format d'erreur standardisé pour une route inconnue", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/unknown" }));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "not_found" } });
  });

  it("un jeton signé avec un secret différent de celui de l'API est refusé", async () => {
    const router = createRouter();
    const tokenAutreSecret = signerJwt({ sub: "installation-1" }, "un-secret-totalement-different", 3600);
    const res = await router.dispatch(req({ path: "/v1/app/health", headers: { authorization: `Bearer ${tokenAutreSecret}` } }));
    expect(res.status).toBe(401);
  });
});
