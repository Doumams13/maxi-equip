import { describe, it, expect } from "vitest";
import { protegerCleParMotDePasse, recupererCleAvecMotDePasse, validerMotDePasse, LONGUEUR_MIN_MOT_DE_PASSE } from "./backupCrypto.js";

describe("backupCrypto — protection de clé par mot de passe (scrypt + AES-256-GCM)", () => {
  it("protège puis récupère correctement une clé avec le bon mot de passe", () => {
    const cle = "abcdef0123456789".repeat(4); // 64 caractères hex, simule une vraie clé 256 bits.
    const protection = protegerCleParMotDePasse(cle, "MonMotDePasse123");
    expect(recupererCleAvecMotDePasse(protection, "MonMotDePasse123")).toBe(cle);
  });

  it("la clé n'apparaît jamais en clair dans le résultat protégé", () => {
    const cle = "abcdef0123456789".repeat(4);
    const protection = protegerCleParMotDePasse(cle, "MonMotDePasse123");
    expect(JSON.stringify(protection)).not.toContain(cle);
  });

  it("TEST B — un mauvais mot de passe provoque un échec explicite, jamais une clé erronée silencieuse", () => {
    const cle = "abcdef0123456789".repeat(4);
    const protection = protegerCleParMotDePasse(cle, "BonMotDePasse");
    expect(() => recupererCleAvecMotDePasse(protection, "MauvaisMotDePasse")).toThrow();
  });

  it("deux protections de la même clé avec le même mot de passe produisent des sels/IV différents (jamais deux fois le même chiffrement)", () => {
    const cle = "abcdef0123456789".repeat(4);
    const p1 = protegerCleParMotDePasse(cle, "MotDePasse");
    const p2 = protegerCleParMotDePasse(cle, "MotDePasse");
    expect(p1.salt).not.toBe(p2.salt);
    expect(p1.iv).not.toBe(p2.iv);
    expect(p1.cleChiffree).not.toBe(p2.cleChiffree);
  });

  it("validerMotDePasse — TEST F : rejette des mots de passe non concordants", () => {
    const resultat = validerMotDePasse("ABCDEFGH", "DEFGHIJK");
    expect(resultat.valide).toBe(false);
  });

  it("validerMotDePasse — rejette un mot de passe vide", () => {
    expect(validerMotDePasse("", "").valide).toBe(false);
  });

  it("validerMotDePasse — rejette un mot de passe trop court", () => {
    const court = "a".repeat(LONGUEUR_MIN_MOT_DE_PASSE - 1);
    expect(validerMotDePasse(court, court).valide).toBe(false);
  });

  it("validerMotDePasse — accepte un mot de passe valide et concordant", () => {
    const valide = "a".repeat(LONGUEUR_MIN_MOT_DE_PASSE);
    expect(validerMotDePasse(valide, valide).valide).toBe(true);
  });
});
