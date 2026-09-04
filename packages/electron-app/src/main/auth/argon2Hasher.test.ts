import { describe, expect, it } from "vitest";
import { Argon2idPasswordHasher } from "./argon2Hasher.js";

describe("Argon2idPasswordHasher (Phase 1 — vraie cryptographie, pas un faux hasher)", () => {
  const hasher = new Argon2idPasswordHasher();

  it("produit un hachage au format Argon2id standard (préfixe $argon2id$)", async () => {
    const hash = await hasher.hash("MonMotDePasse123!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("vérifie correctement le bon mot de passe", async () => {
    const hash = await hasher.hash("MonMotDePasse123!");
    expect(await hasher.verify("MonMotDePasse123!", hash)).toBe(true);
  });

  it("rejette un mauvais mot de passe", async () => {
    const hash = await hasher.hash("MonMotDePasse123!");
    expect(await hasher.verify("UnAutreMotDePasse", hash)).toBe(false);
  });

  it("ne stocke jamais le mot de passe en clair dans le hachage produit", async () => {
    const motDePasse = "MotDePasseUnique_9f8e7d6c";
    const hash = await hasher.hash(motDePasse);
    expect(hash).not.toContain(motDePasse);
  });

  it("produit un hachage différent à chaque appel pour le même mot de passe (sel aléatoire — non réversible de façon triviale)", async () => {
    const hash1 = await hasher.hash("MêmeMotDePasse");
    const hash2 = await hasher.hash("MêmeMotDePasse");
    expect(hash1).not.toBe(hash2);
    // Mais les deux doivent rester vérifiables avec le bon mot de passe.
    expect(await hasher.verify("MêmeMotDePasse", hash1)).toBe(true);
    expect(await hasher.verify("MêmeMotDePasse", hash2)).toBe(true);
  });

  it("est sensible à la casse", async () => {
    const hash = await hasher.hash("MotDePasse");
    expect(await hasher.verify("motdepasse", hash)).toBe(false);
  });
});
