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

  describe("déclenchement de la sauvegarde cloud — système multiposte fiable (2026-10-28)", () => {
    it("synchronisation réussie + backupService fourni : déclenche la vérification de sauvegarde", async () => {
      const syncService = makeSyncService({ success: true });
      const sessionManager = makeSessionManager(true);
      const backupService = { creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => null) };

      await executerSyncRun(syncService, sessionManager, backupService);

      expect(backupService.creerSauvegardeAutomatiqueSiNecessaire).toHaveBeenCalledTimes(1);
    });

    it("sans backupService (rétrocompatibilité) : ne plante jamais, comportement historique inchangé", async () => {
      const syncService = makeSyncService({ success: true });
      const sessionManager = makeSessionManager(true);

      await expect(executerSyncRun(syncService, sessionManager)).resolves.toEqual({ success: true });
    });

    it("synchronisation échouée : ne déclenche JAMAIS la vérification de sauvegarde", async () => {
      const syncService = makeSyncService({ success: false, etape: "push", message: "panne" });
      const sessionManager = makeSessionManager(true);
      const backupService = { creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => null) };

      await executerSyncRun(syncService, sessionManager, backupService);

      expect(backupService.creerSauvegardeAutomatiqueSiNecessaire).not.toHaveBeenCalled();
    });

    it("poste bloqué (success: false) : ne déclenche jamais de sauvegarde non plus", async () => {
      const syncService = makeSyncService({ success: false, etape: "push", posteBloque: true, message: "bloqué" });
      const sessionManager = makeSessionManager(true);
      const backupService = { creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => null) };

      await executerSyncRun(syncService, sessionManager, backupService);

      expect(backupService.creerSauvegardeAutomatiqueSiNecessaire).not.toHaveBeenCalled();
    });
  });
});
