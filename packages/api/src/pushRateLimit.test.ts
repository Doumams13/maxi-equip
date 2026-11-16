import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.8, chantier E — limitation
 * de fréquence applicative sur /v1/sync/push (30 requêtes / 60 secondes
 * par poste authentifié, voir push.ts). Horloge contrôlée
 * (`vi.useFakeTimers()`) pour la preuve de réouverture de fenêtre,
 * jamais un test dépendant du temps réel.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-push-rate-limit";

function tokenPour(sub: string): string {
  return signerJwt({ sub, role: "app" }, SECRET_TEST, 3600);
}

function pushVente(sub: string, entityId: string) {
  return {
    method: "POST" as const,
    path: "/v1/sync/push",
    headers: { authorization: `Bearer ${tokenPour(sub)}` },
    body: { operations: [{ entityType: "vente", entityId, payload: { total: 1000 } }] },
  };
}

describe("Limitation de fréquence sur /v1/sync/push — Phase 5 (référentiel commun), sous-phase 5.8, chantier E", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
    reinitialiserLimitationPourTests();
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
    vi.useRealTimers();
  });

  it("une requête normale passe (200)", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(pushVente("poste-normal", "11111111-1111-4111-8111-111111111111")));
    expect(res.status).toBe(200);
  });

  it("les requêtes légitimes de synchronisation ne sont jamais pénalisées en conditions normales (ex. 10 pushes consécutifs, très en dessous du seuil)", async () => {
    const router = createRouter();
    for (let i = 0; i < 10; i++) {
      const res = await router.dispatch(req(pushVente("poste-normal", `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`)));
      expect(res.status).toBe(200);
    }
  });

  it("un dépassement de seuil (31ᵉ requête en moins de 60 secondes pour le même poste) est refusé proprement avec le code HTTP 429", async () => {
    const router = createRouter();
    const sub = "poste-abusif";
    for (let i = 0; i < 30; i++) {
      const res = await router.dispatch(req(pushVente(sub, `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`)));
      expect(res.status).toBe(200);
    }

    const res31 = await router.dispatch(req(pushVente(sub, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")));

    expect(res31.status).toBe(429);
    expect((res31.body as { error: { code: string } }).error.code).toBe("too_many_requests");
  });

  it("un autre poste n'est JAMAIS pénalisé par l'épuisement du quota d'un poste différent (isolation par clé)", async () => {
    const router = createRouter();
    const subAbusif = "poste-abusif-isolation";
    for (let i = 0; i < 31; i++) {
      await router.dispatch(req(pushVente(subAbusif, `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`)));
    }

    const resAutrePoste = await router.dispatch(req(pushVente("poste-tranquille", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")));
    expect(resAutrePoste.status).toBe(200);
  });

  it("le système redevient accessible après l'écoulement de la fenêtre de limitation (horloge contrôlée)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const router = createRouter();
    const sub = "poste-fenetre";
    for (let i = 0; i < 30; i++) {
      await router.dispatch(req(pushVente(sub, `ffffffff-ffff-4fff-8fff-${String(i).padStart(12, "0")}`)));
    }
    const bloque = await router.dispatch(req(pushVente(sub, "11111111-2222-4333-8444-555555555555")));
    expect(bloque.status).toBe(429);

    // La fenêtre de 60 secondes est écoulée — une nouvelle fenêtre s'ouvre, de nouveau pleinement disponible.
    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
    const deBloque = await router.dispatch(req(pushVente(sub, "66666666-7777-4888-8999-000000000000")));
    expect(deBloque.status).toBe(200);
  });
});
