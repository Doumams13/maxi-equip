import { describe, it, expect, afterEach, vi } from "vitest";
import { CompteSyncService } from "./compteSyncService.js";

/**
 * Tests réels (vrai `fetch` simulé via `vi.stubGlobal`, même convention
 * que emplacementSyncService.test.ts) — correction "visibilité croisée
 * Factures/Historique entre postes" (2026-10-27), Phase 1.
 */

function configurerSync(apiUrl: string | null, jwt: string | null) {
  if (apiUrl) process.env["MAXI_EQUIP_API_URL"] = apiUrl;
  else delete process.env["MAXI_EQUIP_API_URL"];
  if (jwt) process.env["MAXI_EQUIP_SYNC_JWT"] = jwt;
  else delete process.env["MAXI_EQUIP_SYNC_JWT"];
}

describe("CompteSyncService.recupererComptesActifs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configurerSync(null, null);
  });

  it("synchronisation non configurée : ne fait AUCUN appel réseau, échoue proprement", async () => {
    configurerSync(null, null);
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const service = new CompteSyncService();

    const resultat = await service.recupererComptesActifs();

    expect(resultat).toEqual({ success: false, message: "Synchronisation non configurée sur ce poste." });
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("succès : interroge le bon endpoint en GET avec le jeton, renvoie les comptes SANS hash", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/app/comptes/list");
      expect(options?.method).toBe("GET");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
      return new Response(JSON.stringify({ comptes: [{ id: "u1", identifiant: "awa", nom: "Awa Ndiaye", role: "gerant", actif: true }] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchSimule);
    const service = new CompteSyncService();

    const resultat = await service.recupererComptesActifs();

    expect(resultat).toEqual({ success: true, comptes: [{ id: "u1", identifiant: "awa", nom: "Awa Ndiaye", role: "gerant", actif: true }] });
  });

  it("le serveur refuse (HTTP non ok) : échec propre avec le code HTTP, jamais une exception", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const service = new CompteSyncService();

    const resultat = await service.recupererComptesActifs();

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
    const service = new CompteSyncService();

    const resultat = await service.recupererComptesActifs();

    expect(resultat.success).toBe(false);
    expect(!resultat.success && resultat.message).toContain("ECONNREFUSED");
  });
});
