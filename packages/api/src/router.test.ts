import { describe, expect, it } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

describe("Router (Phase 0 — socle API)", () => {
  it("répond 200 sur une route publique sans authentification", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/public/health" }));
    expect(res.status).toBe(200);
  });

  it("refuse une route de niveau 'app' sans en-tête d'authentification (401)", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/app/health" }));
    expect(res.status).toBe(401);
  });

  it("accepte une route de niveau 'app' avec un en-tête d'authentification présent", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ path: "/v1/app/health", headers: { authorization: "Bearer test-token" } })
    );
    expect(res.status).toBe(200);
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
});
