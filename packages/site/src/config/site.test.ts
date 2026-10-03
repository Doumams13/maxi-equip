import { describe, it, expect } from "vitest";
import { buildWhatsAppUrl, siteConfig } from "./site";

describe("buildWhatsAppUrl", () => {
  it("utilise le numéro statique par défaut (comportement inchangé)", () => {
    const attendu = siteConfig.contact.whatsappNumberIntl.replace(/\D/g, "");
    expect(buildWhatsAppUrl()).toBe(`https://wa.me/${attendu}`);
  });

  it("utilise le numéro fourni en priorité, jamais le repli statique", () => {
    expect(buildWhatsAppUrl(undefined, "+24177000001")).toBe("https://wa.me/24177000001");
  });

  it("nettoie un numéro saisi avec espaces (correction 'L'appli gère les infos du site' — saisie humaine côté app)", () => {
    expect(buildWhatsAppUrl(undefined, "+241 66 33 87 30")).toBe("https://wa.me/24166338730");
  });

  it("ajoute le message encodé quand fourni", () => {
    expect(buildWhatsAppUrl("Bonjour !", "+24177000001")).toBe("https://wa.me/24177000001?text=Bonjour%20!");
  });
});
