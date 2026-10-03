import { describe, it, expect, afterEach } from "vitest";
import { resoudreOrigineAutorisee, enTetesCors, enTetesPreflight } from "./cors.js";

describe("CORS — Phase Finale (audit pré-production)", () => {
  afterEach(() => {
    delete process.env["CORS_ALLOWED_ORIGINS"];
    delete process.env["MAXI_EQUIP_ENV"];
  });

  it("production sans CORS_ALLOWED_ORIGINS configurée : échec fermé, aucune origine autorisée", () => {
    process.env["MAXI_EQUIP_ENV"] = "production";
    expect(resoudreOrigineAutorisee("https://maxi-equip.com")).toBeNull();
    expect(enTetesCors("https://maxi-equip.com")).toEqual({});
  });

  it("développement sans configuration : toute origine acceptée (secours, comme JWT/URL publique)", () => {
    process.env["MAXI_EQUIP_ENV"] = "development";
    expect(resoudreOrigineAutorisee("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("CORS_ALLOWED_ORIGINS configurée : seules les origines listées sont reflétées, jamais un wildcard", () => {
    process.env["MAXI_EQUIP_ENV"] = "production";
    process.env["CORS_ALLOWED_ORIGINS"] = "https://maxi-equip.com,https://www.maxi-equip.com";

    expect(resoudreOrigineAutorisee("https://maxi-equip.com")).toBe("https://maxi-equip.com");
    expect(resoudreOrigineAutorisee("https://www.maxi-equip.com")).toBe("https://www.maxi-equip.com");
    expect(resoudreOrigineAutorisee("https://evil.example")).toBeNull();
  });

  it("aucun en-tête Origin dans la requête : aucun en-tête CORS renvoyé", () => {
    expect(resoudreOrigineAutorisee(undefined)).toBeNull();
    expect(enTetesCors(undefined)).toEqual({});
  });

  it("enTetesCors : jamais de wildcard '*' même en développement", () => {
    process.env["MAXI_EQUIP_ENV"] = "development";
    const headers = enTetesCors("http://localhost:3000");
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });

  it("enTetesPreflight : inclut méthodes/en-têtes autorisés uniquement si l'origine est acceptée", () => {
    process.env["MAXI_EQUIP_ENV"] = "production";
    process.env["CORS_ALLOWED_ORIGINS"] = "https://maxi-equip.com";

    expect(enTetesPreflight("https://maxi-equip.com")).toMatchObject({
      "Access-Control-Allow-Origin": "https://maxi-equip.com",
      "Access-Control-Allow-Methods": expect.stringContaining("POST"),
    });
    expect(enTetesPreflight("https://evil.example")).toEqual({});
  });
});
