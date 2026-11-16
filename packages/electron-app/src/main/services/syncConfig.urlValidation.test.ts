import { describe, it, expect, afterEach, vi } from "vitest";
import { validerApiUrl, getConfigurationSync } from "./syncConfig.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.8, chantier C — validation
 * de MAXI_EQUIP_API_URL. `validerApiUrl` est pure (prend `estPackage` en
 * paramètre explicite, jamais lu depuis `app.isPackaged` en interne) :
 * testable directement, sans mocker Electron.
 */
describe("validerApiUrl — Phase 5 (référentiel commun), sous-phase 5.8, chantier C", () => {
  it("1 — http://localhost en développement (estPackage=false) : aucun avertissement", () => {
    expect(validerApiUrl("http://localhost:8787", false)).toEqual({ type: "ok" });
  });

  it("2 — http://127.0.0.1 en développement (estPackage=false) : aucun avertissement", () => {
    expect(validerApiUrl("http://127.0.0.1:8787", false)).toEqual({ type: "ok" });
  });

  it("3 — http:// en environnement packagé (estPackage=true) : avertissement explicite", () => {
    const resultat = validerApiUrl("http://api.maxi-equip.com", true);
    expect(resultat.type).toBe("avertissement_http_non_chiffre");
    expect((resultat as { message: string }).message).toContain("HTTP non chiffré");
    expect((resultat as { message: string }).message).toContain("http://api.maxi-equip.com");
  });

  it("4 — https:// en environnement packagé : aucun avertissement lié au chiffrement", () => {
    expect(validerApiUrl("https://api.maxi-equip.com", true)).toEqual({ type: "ok" });
  });

  it("https:// en développement également : aucun avertissement (jamais spécifique à l'environnement packagé)", () => {
    expect(validerApiUrl("https://api.maxi-equip.com", false)).toEqual({ type: "ok" });
  });

  it("5 — URL malformée : signalée distinctement, jamais confondue avec l'avertissement HTTP, jamais une exception", () => {
    expect(() => validerApiUrl("ceci n'est pas une url", true)).not.toThrow();
    const resultat = validerApiUrl("ceci n'est pas une url", true);
    expect(resultat.type).toBe("url_malformee");
  });

  it("6 — configuration absente (chaîne vide/undefined/null) : signalée distinctement, jamais une exception, jamais confondue avec l'avertissement HTTP", () => {
    expect(validerApiUrl(undefined, true).type).toBe("url_malformee");
    expect(validerApiUrl(null, true).type).toBe("url_malformee");
    expect(validerApiUrl("", true).type).toBe("url_malformee");
    expect(validerApiUrl("   ", true).type).toBe("url_malformee");
  });

  it("une URL avec un protocole différent (ex. ftp://) n'est jamais confondue avec HTTP — comparaison robuste via URL.protocol, jamais une sous-chaîne approximative", () => {
    expect(validerApiUrl("ftp://exemple.com", true)).toEqual({ type: "ok" });
  });
});

describe("getConfigurationSync() — intégration de la validation d'URL (Phase 5, sous-phase 5.8, chantier C)", () => {
  afterEach(() => {
    delete process.env["MAXI_EQUIP_API_URL"];
    vi.restoreAllMocks();
  });

  it("n'émet AUCUN avertissement en environnement de test/développement (app.isPackaged indisponible hors runtime Electron réel, dégradé à false)", () => {
    process.env["MAXI_EQUIP_API_URL"] = "http://localhost:9999";
    const avertissementSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = getConfigurationSync();

    expect(config.apiUrl).toBe("http://localhost:9999");
    expect(avertissementSpy).not.toHaveBeenCalled();
  });
});
