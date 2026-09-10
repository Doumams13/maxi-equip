import { describe, expect, it, afterEach } from "vitest";
import { getJwtSecret, ConfigurationSecuriteError } from "./config.js";

describe("Configuration du secret JWT (Phase 3.5, Partie 3)", () => {
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
  });

  it("utilise une valeur de secours stable en développement si aucun secret n'est configuré", () => {
    process.env["MAXI_EQUIP_ENV"] = "development";
    delete process.env["JWT_SIGNING_SECRET"];
    expect(() => getJwtSecret()).not.toThrow();
    expect(getJwtSecret().length).toBeGreaterThan(0);
  });

  it("utilise le secret explicitement configuré s'il est présent, quel que soit l'environnement", () => {
    process.env["MAXI_EQUIP_ENV"] = "test";
    process.env["JWT_SIGNING_SECRET"] = "mon-secret-de-test-explicite";
    expect(getJwtSecret()).toBe("mon-secret-de-test-explicite");
  });

  it("REFUSE de démarrer sans secret explicite en production — jamais de valeur par défaut silencieuse", () => {
    process.env["MAXI_EQUIP_ENV"] = "production";
    delete process.env["JWT_SIGNING_SECRET"];
    expect(() => getJwtSecret()).toThrow(ConfigurationSecuriteError);
  });

  it("accepte un secret configuré en production", () => {
    process.env["MAXI_EQUIP_ENV"] = "production";
    process.env["JWT_SIGNING_SECRET"] = "vrai-secret-de-production";
    expect(getJwtSecret()).toBe("vrai-secret-de-production");
  });
});
