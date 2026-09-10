import { describe, expect, it } from "vitest";
import { emettreJetonApplication, EmissionJetonError, DUREE_JETON_APPLICATION_PAR_DEFAUT_SECONDES } from "./emissionJetonApplication.js";
import { verifierJwt } from "./jwt.js";

const SECRET = "secret-de-test-emission";

describe("Émission de jetons applicatifs — expiration obligatoire (Phase 3.5.1, Partie 4)", () => {
  it("émet un jeton valide avec la durée par défaut si aucune n'est précisée", () => {
    const token = emettreJetonApplication("installation-test", SECRET);
    const resultat = verifierJwt(token, SECRET);
    expect(resultat.valide).toBe(true);
    if (resultat.valide) {
      expect(resultat.payload.sub).toBe("installation-test");
      expect(resultat.payload.exp).toBeDefined();
      expect(resultat.payload.exp! - resultat.payload.iat!).toBe(DUREE_JETON_APPLICATION_PAR_DEFAUT_SECONDES);
    }
  });

  it("émet un jeton avec une durée explicite différente si demandé", () => {
    const token = emettreJetonApplication("installation-test", SECRET, 3600);
    const resultat = verifierJwt(token, SECRET);
    expect(resultat.valide).toBe(true);
    if (resultat.valide) expect(resultat.payload.exp! - resultat.payload.iat!).toBe(3600);
  });

  it("REFUSE d'émettre un jeton sans expiration (durée à 0)", () => {
    expect(() => emettreJetonApplication("installation-test", SECRET, 0)).toThrow(EmissionJetonError);
  });

  it("REFUSE d'émettre un jeton avec une durée négative", () => {
    expect(() => emettreJetonApplication("installation-test", SECRET, -100)).toThrow(EmissionJetonError);
  });

  it("REFUSE d'émettre un jeton sans identité de client", () => {
    expect(() => emettreJetonApplication("", SECRET)).toThrow(EmissionJetonError);
    expect(() => emettreJetonApplication("   ", SECRET)).toThrow(EmissionJetonError);
  });

  it("le jeton émis est immédiatement valide", () => {
    const token = emettreJetonApplication("installation-test", SECRET, 1);
    const resultat = verifierJwt(token, SECRET);
    expect(resultat.valide).toBe(true);
  });
});
