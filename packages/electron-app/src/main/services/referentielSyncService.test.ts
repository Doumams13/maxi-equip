import { describe, it, expect, afterEach, vi } from "vitest";
import { ReferentielSyncService } from "./referentielSyncService.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.4 — même convention exacte
 * que `catalogueSyncService.test.ts`/`emplacementSyncService.test.ts`
 * (vrai `fetch` simulé via `vi.stubGlobal`, jamais un mock du service
 * lui-même).
 */

function configurerSync(apiUrl: string | null, jwt: string | null) {
  if (apiUrl) process.env["MAXI_EQUIP_API_URL"] = apiUrl;
  else delete process.env["MAXI_EQUIP_API_URL"];
  if (jwt) process.env["MAXI_EQUIP_SYNC_JWT"] = jwt;
  else delete process.env["MAXI_EQUIP_SYNC_JWT"];
}

describe("ReferentielSyncService.recupererReferentiel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    configurerSync(null, null);
  });

  it("synchronisation non configurée : ne fait AUCUN appel réseau, échoue proprement", async () => {
    configurerSync(null, null);
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const service = new ReferentielSyncService();

    const resultat = await service.recupererReferentiel();

    expect(resultat).toEqual({ success: false, message: "Synchronisation non configurée sur ce poste." });
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("succès : interroge le bon endpoint en GET avec le jeton, renvoie les 3 collections avec la configuration d'unités en sous-objet", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/app/referentiel/list");
      expect(options?.method).toBe("GET");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
      return new Response(
        JSON.stringify({
          categories: [{ id: "c1", nom: "Quincaillerie générale", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" }],
          sousCategories: [
            { id: "sc1", categorieId: "c1", nom: "Ciments", ordre: 0, modelePhysique: null, unitesAutorisees: ["sac", "kg"], updatedAt: "2026-01-01T00:00:00.000Z" },
          ],
          sousCategorieChamps: [
            {
              id: "ch1",
              sousCategorieId: "sc1",
              nom: "Poids",
              type: "nombre",
              obligatoire: true,
              valeursAutorisees: null,
              uniteMesure: "kg",
              role: "physique",
              ordre: 0,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchSimule);
    const service = new ReferentielSyncService();

    const resultat = await service.recupererReferentiel();

    expect(resultat.success).toBe(true);
    if (!resultat.success) throw new Error("inattendu");
    expect(resultat.categories).toEqual([{ id: "c1", nom: "Quincaillerie générale", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" }]);
    expect(resultat.sousCategories[0]).toMatchObject({ id: "sc1", unitesAutorisees: ["sac", "kg"] });
    expect(resultat.sousCategorieChamps[0]).toMatchObject({ id: "ch1", nom: "Poids", obligatoire: true });
  });

  it("le serveur refuse (HTTP non ok) : échec propre avec le code HTTP, jamais une exception", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const service = new ReferentielSyncService();

    const resultat = await service.recupererReferentiel();

    expect(resultat).toEqual({ success: false, message: "Le serveur a refusé la demande (HTTP 500)." });
  });

  it("serveur injoignable (fetch rejette) : échec propre, jamais une exception non gérée", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const service = new ReferentielSyncService();

    const resultat = await service.recupererReferentiel();

    expect(resultat.success).toBe(false);
    expect(!resultat.success && resultat.message).toContain("ECONNREFUSED");
  });

  it("timeout : la requête est abandonnée après 15 secondes (AbortController réel), échec propre jamais une exception", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      })
    );
    const service = new ReferentielSyncService();

    const promesse = service.recupererReferentiel();
    await vi.advanceTimersByTimeAsync(15_000);
    const resultat = await promesse;

    expect(resultat.success).toBe(false);
  });
});
