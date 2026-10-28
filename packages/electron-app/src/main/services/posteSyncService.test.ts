import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Système multiposte fiable (2026-10-28), Phase C. Même convention que
 * `installationRecuperationService.test.ts` : seul
 * `definirConfigurationSyncLocale` est remplacé par un espion (reste de
 * `./syncConfig.js` INCHANGÉ — `getConfigurationSync()` dégrade déjà
 * silencieusement vers les variables d'environnement hors runtime
 * Electron réel) — jamais un `vi.mock("electron")`.
 */
const definirConfigurationSyncLocaleMock = vi.hoisted(() => vi.fn());
vi.mock("./syncConfig.js", async (importActual) => {
  const actual = await importActual<typeof import("./syncConfig.js")>();
  return { ...actual, definirConfigurationSyncLocale: definirConfigurationSyncLocaleMock };
});

import { PosteSyncService } from "./posteSyncService.js";

function configurerSync(apiUrl: string | null, jwt: string | null) {
  if (apiUrl) process.env["MAXI_EQUIP_API_URL"] = apiUrl;
  else delete process.env["MAXI_EQUIP_API_URL"];
  if (jwt) process.env["MAXI_EQUIP_SYNC_JWT"] = jwt;
  else delete process.env["MAXI_EQUIP_SYNC_JWT"];
}

describe("PosteSyncService", () => {
  beforeEach(() => {
    definirConfigurationSyncLocaleMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    configurerSync(null, null);
  });

  describe("isolation d'une installation indépendante", () => {
    it("obtenirMoi : aucun appel réseau sans synchronisation configurée", async () => {
      configurerSync(null, null);
      const fetchSimule = vi.fn();
      vi.stubGlobal("fetch", fetchSimule);

      const resultat = await new PosteSyncService().obtenirMoi();

      expect(resultat).toEqual({ success: false, message: "Synchronisation non configurée sur ce poste." });
      expect(fetchSimule).not.toHaveBeenCalled();
    });

    it("rejoindreRegistre : aucun appel réseau ni écriture de configuration sans synchronisation configurée", async () => {
      configurerSync(null, null);
      const fetchSimule = vi.fn();
      vi.stubGlobal("fetch", fetchSimule);

      const resultat = await new PosteSyncService().rejoindreRegistre();

      expect(resultat.success).toBe(false);
      expect(fetchSimule).not.toHaveBeenCalled();
      expect(definirConfigurationSyncLocaleMock).not.toHaveBeenCalled();
    });

    it("lister/bloquer/reautoriser/retirer/definirNom : aucun appel réseau sans synchronisation configurée", async () => {
      configurerSync(null, null);
      const fetchSimule = vi.fn();
      vi.stubGlobal("fetch", fetchSimule);
      const service = new PosteSyncService();

      await service.lister();
      await service.bloquer("p1");
      await service.reautoriser("p1");
      await service.retirer("p1");
      await service.definirNom("PCX1");

      expect(fetchSimule).not.toHaveBeenCalled();
    });
  });

  describe("obtenirMoi", () => {
    it("succès : interroge GET /v1/app/postes/moi avec le jeton, renvoie le poste", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
        expect(url).toBe("https://api.example.com/v1/app/postes/moi");
        expect(options?.method).toBe("GET");
        expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
        return new Response(
          JSON.stringify({ poste: { id: "p1", nom: null, role: "pcx", statut: "actif", enregistreLe: "2026-10-28T00:00:00.000Z", dernierContactLe: null } }),
          { status: 200 }
        );
      });
      vi.stubGlobal("fetch", fetchSimule);

      const resultat = await new PosteSyncService().obtenirMoi();

      expect(resultat).toEqual({
        success: true,
        poste: { id: "p1", nom: null, role: "pcx", statut: "actif", enregistreLe: "2026-10-28T00:00:00.000Z", dernierContactLe: null },
      });
    });

    it("le serveur refuse (HTTP non ok) : échec propre, jamais une exception", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "jeton invalide" } }), { status: 401 })));

      const resultat = await new PosteSyncService().obtenirMoi();

      expect(resultat).toEqual({ success: false, message: "jeton invalide" });
    });

    it("serveur injoignable (fetch rejette) : échec propre, jamais une exception non gérée", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("ECONNREFUSED");
        })
      );

      const resultat = await new PosteSyncService().obtenirMoi();

      expect(resultat.success).toBe(false);
      expect(!resultat.success && resultat.message).toContain("ECONNREFUSED");
    });
  });

  describe("definirNom", () => {
    it("envoie POST /v1/app/postes/definir-nom avec le nom dans le corps", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
        expect(url).toBe("https://api.example.com/v1/app/postes/definir-nom");
        expect(options?.method).toBe("POST");
        expect(JSON.parse(options!.body as string)).toEqual({ nom: "PCX1 - Comptoir" });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchSimule);

      const resultat = await new PosteSyncService().definirNom("PCX1 - Comptoir");

      expect(resultat).toEqual({ success: true });
    });
  });

  describe("rejoindreRegistre", () => {
    it("succès : appelle re-emettre-moi puis persiste UNIQUEMENT le nouveau jeton, en préservant apiUrl", async () => {
      configurerSync("https://api.example.com", "ancien-jeton");
      const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
        expect(url).toBe("https://api.example.com/v1/app/postes/re-emettre-moi");
        expect(options?.method).toBe("POST");
        return new Response(
          JSON.stringify({ jwt: "nouveau-jeton", poste: { id: "shop-1", nom: null, role: "shop", statut: "actif", enregistreLe: "x", dernierContactLe: null } }),
          { status: 200 }
        );
      });
      vi.stubGlobal("fetch", fetchSimule);

      const resultat = await new PosteSyncService().rejoindreRegistre();

      expect(resultat).toEqual({ success: true });
      expect(definirConfigurationSyncLocaleMock).toHaveBeenCalledTimes(1);
      expect(definirConfigurationSyncLocaleMock).toHaveBeenCalledWith({ apiUrl: "https://api.example.com", jwt: "nouveau-jeton" });
    });

    it("le serveur refuse : échec propre, jamais d'écriture de configuration locale", async () => {
      configurerSync("https://api.example.com", "ancien-jeton");
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "refusé" } }), { status: 500 })));

      const resultat = await new PosteSyncService().rejoindreRegistre();

      expect(resultat).toEqual({ success: false, message: "refusé" });
      expect(definirConfigurationSyncLocaleMock).not.toHaveBeenCalled();
    });
  });

  describe("bloquer / reautoriser / retirer", () => {
    it("bloquer envoie POST /v1/app/postes/bloquer avec posteId", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      const fetchSimule = vi.fn(async (url: string, options?: RequestInit) => {
        expect(url).toBe("https://api.example.com/v1/app/postes/bloquer");
        expect(JSON.parse(options!.body as string)).toEqual({ posteId: "p1" });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchSimule);

      expect(await new PosteSyncService().bloquer("p1")).toEqual({ success: true });
    });

    it("reautoriser envoie POST /v1/app/postes/reautoriser avec posteId", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          expect(url).toBe("https://api.example.com/v1/app/postes/reautoriser");
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        })
      );

      expect(await new PosteSyncService().reautoriser("p1")).toEqual({ success: true });
    });

    it("retirer envoie POST /v1/app/postes/retirer avec posteId", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          expect(url).toBe("https://api.example.com/v1/app/postes/retirer");
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        })
      );

      expect(await new PosteSyncService().retirer("p1")).toEqual({ success: true });
    });
  });

  describe("lister", () => {
    it("succès : interroge GET /v1/app/postes/list, renvoie les postes", async () => {
      configurerSync("https://api.example.com", "jeton-test");
      const postes = [{ id: "p1", nom: "Shop", role: "shop" as const, statut: "actif" as const, enregistreLe: "x", dernierContactLe: null }];
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ postes }), { status: 200 })));

      expect(await new PosteSyncService().lister()).toEqual({ success: true, postes });
    });
  });
});
