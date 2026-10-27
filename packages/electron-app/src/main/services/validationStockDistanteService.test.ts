import { describe, it, expect, afterEach, vi } from "vitest";
import { ValidationStockDistanteService } from "./validationStockDistanteService.js";

/**
 * Tests réels (vrai `fetch` simulé via `vi.stubGlobal`, même convention
 * que syncService.test.ts) de `initialiserStockCentral` — correction "pc
 * annexe ne peut pas vendre malgré le stock réel" (2026-10-27).
 *
 * Configuration via variables d'environnement (jamais
 * `definirConfigurationSyncLocale`, qui exige un vrai runtime Electron —
 * voir syncConfig.ts et syncService.test.ts pour cette même convention).
 */

const LIGNES = [{ produitId: "p1", emplacementId: "akebe", quantite: 29 }];

function configurerSync(apiUrl: string | null, jwt: string | null) {
  if (apiUrl) process.env["MAXI_EQUIP_API_URL"] = apiUrl;
  else delete process.env["MAXI_EQUIP_API_URL"];
  if (jwt) process.env["MAXI_EQUIP_SYNC_JWT"] = jwt;
  else delete process.env["MAXI_EQUIP_SYNC_JWT"];
}

describe("ValidationStockDistanteService.initialiserStockCentral", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configurerSync(null, null);
  });

  it("synchronisation non configurée : ne fait AUCUN appel réseau, échoue proprement", async () => {
    configurerSync(null, null);
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const service = new ValidationStockDistanteService();

    const resultat = await service.initialiserStockCentral(LIGNES);

    expect(resultat).toEqual({ success: false, message: "Synchronisation non configurée sur ce poste." });
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("succès : envoie les lignes au bon endpoint avec le jeton, renvoie le nombre de lignes appliquées", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/app/operations/initialiser-stock");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
      expect(JSON.parse(options!.body as string)).toEqual({ lignes: LIGNES });
      return new Response(JSON.stringify({ lignesAppliquees: 1 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSimule);
    const service = new ValidationStockDistanteService();

    const resultat = await service.initialiserStockCentral(LIGNES);

    expect(resultat).toEqual({ success: true, lignesAppliquees: 1 });
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("le serveur refuse (HTTP non ok) : échec propre avec le code HTTP, jamais une exception", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 400 })));
    const service = new ValidationStockDistanteService();

    const resultat = await service.initialiserStockCentral(LIGNES);

    expect(resultat).toEqual({ success: false, message: "Le serveur a refusé la demande (HTTP 400)." });
  });

  it("serveur injoignable (fetch rejette) : échec propre, jamais une exception non gérée", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const service = new ValidationStockDistanteService();

    const resultat = await service.initialiserStockCentral(LIGNES);

    expect(resultat.success).toBe(false);
    expect(!resultat.success && resultat.message).toContain("ECONNREFUSED");
  });
});

/**
 * Tests réels (vrai `fetch` simulé via `vi.stubGlobal`) de
 * `recupererStockCentral` — correction "vente sur un poste annexe non
 * répercutée sur le PC Shop après 10+ minutes" (2026-10-27).
 */
describe("ValidationStockDistanteService.recupererStockCentral", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configurerSync(null, null);
  });

  it("synchronisation non configurée : ne fait AUCUN appel réseau, échoue proprement", async () => {
    configurerSync(null, null);
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const service = new ValidationStockDistanteService();

    const resultat = await service.recupererStockCentral();

    expect(resultat).toEqual({ success: false, message: "Synchronisation non configurée sur ce poste." });
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("succès : interroge le bon endpoint en GET avec le jeton, renvoie les lignes", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/app/operations/stock");
      expect(options?.method).toBe("GET");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
      return new Response(JSON.stringify({ lignes: [{ produitId: "p1", emplacementId: "akebe", quantite: 13 }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSimule);
    const service = new ValidationStockDistanteService();

    const resultat = await service.recupererStockCentral();

    expect(resultat).toEqual({ success: true, lignes: [{ produitId: "p1", emplacementId: "akebe", quantite: 13 }] });
  });

  it("le serveur refuse (HTTP non ok) : échec propre avec le code HTTP, jamais une exception", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const service = new ValidationStockDistanteService();

    const resultat = await service.recupererStockCentral();

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
    const service = new ValidationStockDistanteService();

    const resultat = await service.recupererStockCentral();

    expect(resultat.success).toBe(false);
    expect(!resultat.success && resultat.message).toContain("ECONNREFUSED");
  });
});
