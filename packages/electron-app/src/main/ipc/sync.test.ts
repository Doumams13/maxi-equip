import { describe, it, expect, vi } from "vitest";
import { executerSyncRun } from "./sync.js";

/**
 * Système multiposte fiable (2026-10-28) — logique pure, testée sans
 * `electron` (voir initialisationStockCentral.test.ts pour la
 * convention de ce projet).
 */

function makeSyncService(resultat: Awaited<ReturnType<typeof executerSyncRun>>) {
  return { executerSynchronisation: vi.fn(async () => resultat) };
}

function makeSessionManager(authentifie: boolean) {
  return { isAuthenticated: vi.fn(() => authentifie), clear: vi.fn() };
}

describe("executerSyncRun", () => {
  it("rejette un appelant sans session, jamais d'appel à la synchronisation", async () => {
    const syncService = makeSyncService({ success: true });
    const sessionManager = makeSessionManager(false);

    const resultat = await executerSyncRun(syncService, sessionManager);

    expect(resultat).toEqual({ success: false, etape: "push", message: "Non authentifié." });
    expect(syncService.executerSynchronisation).not.toHaveBeenCalled();
  });

  it("synchronisation normale (posteBloque absent) : ne touche jamais à la session", async () => {
    const syncService = makeSyncService({ success: true, push: { envoyees: 1, confirmees: 1 } });
    const sessionManager = makeSessionManager(true);

    const resultat = await executerSyncRun(syncService, sessionManager);

    expect(resultat).toEqual({ success: true, push: { envoyees: 1, confirmees: 1 } });
    expect(sessionManager.clear).not.toHaveBeenCalled();
  });

  it("posteBloque: true → ferme IMMÉDIATEMENT la session locale", async () => {
    const syncService = makeSyncService({ success: false, etape: "push", posteBloque: true, message: "Ce poste a été bloqué par un administrateur." });
    const sessionManager = makeSessionManager(true);

    const resultat = await executerSyncRun(syncService, sessionManager);

    expect(resultat.posteBloque).toBe(true);
    expect(sessionManager.clear).toHaveBeenCalledTimes(1);
  });
});
