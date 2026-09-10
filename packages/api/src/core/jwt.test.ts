import { describe, expect, it } from "vitest";
import { signerJwt, verifierJwt } from "./jwt.js";

const SECRET = "secret-de-test-jamais-utilise-ailleurs";

describe("JWT — signature et vérification réelles (Phase 3.5)", () => {
  it("signe puis vérifie un jeton valide avec succès", () => {
    const token = signerJwt({ sub: "installation-1", role: "app" }, SECRET);
    const resultat = verifierJwt(token, SECRET);
    expect(resultat.valide).toBe(true);
    if (resultat.valide) {
      expect(resultat.payload.sub).toBe("installation-1");
      expect(resultat.payload.role).toBe("app");
    }
  });

  it("produit un JWT au format standard à 3 segments", () => {
    const token = signerJwt({ sub: "x" }, SECRET);
    expect(token.split(".")).toHaveLength(3);
  });

  it("refuse un jeton dont la signature a été falsifiée", () => {
    const token = signerJwt({ sub: "installation-1", role: "app" }, SECRET);
    const [entete, , signature] = token.split(".");
    const payloadFalsifie = Buffer.from(JSON.stringify({ sub: "installation-1", role: "admin-usurpe" })).toString("base64url");
    const tokenFalsifie = `${entete}.${payloadFalsifie}.${signature}`;
    const resultat = verifierJwt(tokenFalsifie, SECRET);
    expect(resultat.valide).toBe(false);
    if (!resultat.valide) expect(resultat.raison).toBe("signature");
  });

  it("refuse un jeton signé avec un autre secret", () => {
    const token = signerJwt({ sub: "installation-1" }, "un-autre-secret");
    const resultat = verifierJwt(token, SECRET);
    expect(resultat.valide).toBe(false);
    if (!resultat.valide) expect(resultat.raison).toBe("signature");
  });

  it("refuse un jeton malformé (texte arbitraire)", () => {
    expect(verifierJwt("ceci-nest-pas-un-jwt", SECRET).valide).toBe(false);
  });

  it("refuse un jeton avec un nombre de segments incorrect", () => {
    expect(verifierJwt("a.b", SECRET).valide).toBe(false);
    expect(verifierJwt("a.b.c.d", SECRET).valide).toBe(false);
  });

  it("refuse un jeton expiré", () => {
    const token = signerJwt({ sub: "installation-1" }, SECRET, -10); // exp = maintenant - 10s
    const resultat = verifierJwt(token, SECRET);
    expect(resultat.valide).toBe(false);
    if (!resultat.valide) expect(resultat.raison).toBe("expire");
  });

  it("accepte un jeton avec une expiration future", () => {
    const token = signerJwt({ sub: "installation-1" }, SECRET, 3600);
    expect(verifierJwt(token, SECRET).valide).toBe(true);
  });

  it("accepte un jeton sans expiration du tout (exp absent)", () => {
    const token = signerJwt({ sub: "installation-1" }, SECRET);
    expect(verifierJwt(token, SECRET).valide).toBe(true);
  });

  it("refuse un jeton dont le payload ne contient pas de sujet (sub)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = signerJwt({} as any, SECRET);
    expect(verifierJwt(token, SECRET).valide).toBe(false);
  });
});
