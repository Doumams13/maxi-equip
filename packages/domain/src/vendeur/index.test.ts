import { describe, expect, it } from "vitest";
import { resolveVendeurEffectif } from "./index.js";

describe("Vendeur — attribution", () => {
  it("utilise le compte connecté par défaut, si aucune précision manuelle", () => {
    const result = resolveVendeurEffectif({ compteConnecteNom: "Alice Nguema", vendeurNomManuel: null });
    expect(result).toEqual({ nomAffiche: "Alice Nguema", estPrecisionManuelle: false });
  });

  it("utilise le compte connecté si la précision manuelle est une chaîne vide", () => {
    const result = resolveVendeurEffectif({ compteConnecteNom: "Alice Nguema", vendeurNomManuel: "   " });
    expect(result.nomAffiche).toBe("Alice Nguema");
    expect(result.estPrecisionManuelle).toBe(false);
  });

  it("utilise le vendeur précisé manuellement quand il diffère du compte connecté", () => {
    const result = resolveVendeurEffectif({ compteConnecteNom: "Administrateur", vendeurNomManuel: "Brice Ella" });
    expect(result).toEqual({ nomAffiche: "Brice Ella", estPrecisionManuelle: true });
  });

  it("nettoie les espaces superflus autour du nom précisé manuellement", () => {
    const result = resolveVendeurEffectif({ compteConnecteNom: "Administrateur", vendeurNomManuel: "  Brice Ella  " });
    expect(result.nomAffiche).toBe("Brice Ella");
  });
});
