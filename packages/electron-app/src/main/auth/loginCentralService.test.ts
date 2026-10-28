import { describe, it, expect, afterEach, vi } from "vitest";
import { LoginCentralService } from "./loginCentralService.js";

/**
 * Tests réels (vrai `fetch` simulé via `vi.stubGlobal`, même convention
 * que emplacementSyncService.test.ts) — système multiposte fiable
 * (2026-10-28).
 */

function configurerSync(apiUrl: string | null, jwt: string | null) {
  if (apiUrl) process.env["MAXI_EQUIP_API_URL"] = apiUrl;
  else delete process.env["MAXI_EQUIP_API_URL"];
  if (jwt) process.env["MAXI_EQUIP_SYNC_JWT"] = jwt;
  else delete process.env["MAXI_EQUIP_SYNC_JWT"];
}

describe("LoginCentralService.login", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configurerSync(null, null);
  });

  it("estConfiguree() reflète la présence réelle d'un jeton", () => {
    configurerSync("https://api.example.com", null);
    expect(new LoginCentralService().estConfiguree()).toBe(false);
    configurerSync("https://api.example.com", "jeton-test");
    expect(new LoginCentralService().estConfiguree()).toBe(true);
  });

  it("identifiants invalides (401) : raison 'identifiants_invalides', jamais confondue avec un poste bloqué", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Identifiant ou mot de passe incorrect." } }), { status: 401 })));

    const resultat = await new LoginCentralService().login("marie", "mauvais-mdp");

    expect(resultat).toEqual({ success: false, raison: "identifiants_invalides", message: "Identifiant ou mot de passe incorrect." });
  });

  it("système multiposte fiable (2026-10-28) : poste bloqué (403) → raison 'poste_bloque', jamais 'identifiants_invalides'", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        expect(url).toBe("https://api.example.com/v1/app/auth/login");
        expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
        return new Response(JSON.stringify({ error: { message: "Ce poste a été bloqué par un administrateur." } }), { status: 403 });
      })
    );

    const resultat = await new LoginCentralService().login("marie", "peu-importe");

    expect(resultat).toEqual({ success: false, raison: "poste_bloque", message: "Ce poste a été bloqué par un administrateur." });
  });

  it("trop de tentatives (429) : raison 'trop_de_tentatives'", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Trop de tentatives." } }), { status: 429 })));

    const resultat = await new LoginCentralService().login("marie", "peu-importe");

    expect(resultat).toEqual({ success: false, raison: "trop_de_tentatives", message: "Trop de tentatives." });
  });

  it("succès : renvoie le jeton de session et le compte", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: true, jwt: "jeton-session", compte: { id: "u1", identifiant: "marie", nom: "Marie", role: "gerant" } }),
          { status: 200 }
        )
      )
    );

    const resultat = await new LoginCentralService().login("marie", "bon-mdp");

    expect(resultat).toEqual({ success: true, jwt: "jeton-session", compte: { id: "u1", identifiant: "marie", nom: "Marie", role: "gerant" } });
  });

  it("synchronisation non configurée : ne fait aucun appel réseau, raison 'hors_ligne'", async () => {
    configurerSync(null, null);
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);

    const resultat = await new LoginCentralService().login("marie", "peu-importe");

    expect(resultat.success).toBe(false);
    expect(!resultat.success && resultat.raison).toBe("hors_ligne");
    expect(fetchSimule).not.toHaveBeenCalled();
  });
});
