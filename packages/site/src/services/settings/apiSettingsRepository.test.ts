import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiSettingsRepository, MockSettingsRepository, getEffectiveContactInfo, settingsRepository } from "./index";
import type { CompanySettings } from "@/lib/types/settings";
import { siteConfig } from "@/config/site";

describe("ApiSettingsRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("relaie les coordonnées renvoyées par GET /v1/public/settings", async () => {
    const settings: CompanySettings = {
      nom: "MAXI EQUIP",
      adresse: "Quartier Beaulieu",
      quartier: "Akanda",
      telephones: ["066338730"],
      whatsapp: "+24166338730",
      email: "contact@maxi-equip.com",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/v1/public/settings");
        return new Response(JSON.stringify({ settings }), { status: 200 });
      })
    );
    const repo = new ApiSettingsRepository("http://api.test");
    expect(await repo.getSettings()).toEqual(settings);
  });

  it("propage une erreur claire si l'API répond en échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const repo = new ApiSettingsRepository("http://api.test");
    await expect(repo.getSettings()).rejects.toThrow();
  });
});

describe("MockSettingsRepository", () => {
  it("reflète les valeurs statiques de config/site.ts (comportement inchangé sans API)", async () => {
    const repo = new MockSettingsRepository();
    const settings = await repo.getSettings();
    expect(settings).toEqual({
      nom: siteConfig.companyName,
      adresse: null,
      quartier: siteConfig.city,
      telephones: [siteConfig.contact.phoneDisplay],
      whatsapp: siteConfig.contact.whatsappNumberIntl,
      email: siteConfig.contact.email,
    });
  });
});

describe("getEffectiveContactInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("utilise les valeurs réellement synchronisées quand présentes", async () => {
    vi.spyOn(settingsRepository, "getSettings").mockResolvedValue({
      nom: "MAXI-EQUIP Réel",
      adresse: "Adresse réelle",
      quartier: "Quartier réel",
      telephones: ["077000001"],
      whatsapp: "+24177000001",
      email: "reel@maxi-equip.com",
    });
    const contact = await getEffectiveContactInfo();
    expect(contact).toEqual({
      nom: "MAXI-EQUIP Réel",
      telephone: "077000001",
      whatsapp: "+24177000001",
      email: "reel@maxi-equip.com",
      quartier: "Quartier réel",
      adresse: "Adresse réelle",
    });
  });

  it("replie CHAMP PAR CHAMP sur config/site.ts quand une donnée n'est pas encore synchronisée", async () => {
    vi.spyOn(settingsRepository, "getSettings").mockResolvedValue({
      nom: null,
      adresse: null,
      quartier: null,
      telephones: [],
      whatsapp: null,
      email: null,
    });
    const contact = await getEffectiveContactInfo();
    expect(contact).toEqual({
      nom: siteConfig.companyName,
      telephone: siteConfig.contact.phoneDisplay,
      whatsapp: siteConfig.contact.whatsappNumberIntl,
      email: siteConfig.contact.email,
      quartier: siteConfig.city,
      adresse: null,
    });
  });

  it("replie intégralement sur config/site.ts si l'API est injoignable, jamais une page cassée", async () => {
    vi.spyOn(settingsRepository, "getSettings").mockRejectedValue(new Error("API indisponible"));
    const contact = await getEffectiveContactInfo();
    expect(contact).toEqual({
      nom: siteConfig.companyName,
      telephone: siteConfig.contact.phoneDisplay,
      whatsapp: siteConfig.contact.whatsappNumberIntl,
      email: siteConfig.contact.email,
      quartier: siteConfig.city,
      adresse: null,
    });
  });
});
