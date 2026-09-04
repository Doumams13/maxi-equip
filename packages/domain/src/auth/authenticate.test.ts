import { describe, expect, it } from "vitest";
import { authenticate } from "./authenticate.js";
import type { PasswordHasher, UtilisateurAuthentifiable } from "./types.js";

/**
 * Faux hasher déterministe pour les tests du domaine — ne calcule jamais
 * un vrai Argon2id (ce n'est pas le rôle du domaine, voir types.ts).
 * Le vrai hachage Argon2id est testé séparément dans packages/electron-app
 * (packages/electron-app/src/main/auth/argon2Hasher.test.ts), avec une
 * vraie bibliothèque cryptographique.
 */
function createFakeHasher(): PasswordHasher {
  return {
    async hash(motDePasse) {
      return `fake-hash(${motDePasse})`;
    },
    async verify(motDePasse, hash) {
      return hash === `fake-hash(${motDePasse})`;
    },
  };
}

function buildUtilisateur(overrides: Partial<UtilisateurAuthentifiable> = {}): UtilisateurAuthentifiable {
  return {
    id: "u1",
    identifiant: "alice",
    passwordHash: "fake-hash(bon-mot-de-passe)",
    role: "gerant",
    actif: true,
    ...overrides,
  };
}

describe("authenticate (Phase 1 — authentification locale)", () => {
  it("réussit avec un mot de passe correct", async () => {
    const utilisateur = buildUtilisateur();
    const result = await authenticate(utilisateur, "bon-mot-de-passe", createFakeHasher());
    expect(result).toEqual({ success: true, userId: "u1", role: "gerant" });
  });

  it("échoue avec un mauvais mot de passe", async () => {
    const utilisateur = buildUtilisateur();
    const result = await authenticate(utilisateur, "mauvais-mot-de-passe", createFakeHasher());
    expect(result).toEqual({ success: false, reason: "WRONG_PASSWORD" });
  });

  it("échoue si l'utilisateur n'existe pas (null fourni par le dépôt de données)", async () => {
    const result = await authenticate(null, "peu-importe", createFakeHasher());
    expect(result).toEqual({ success: false, reason: "USER_NOT_FOUND" });
  });

  it("échoue si le compte est marqué inactif, même avec le bon mot de passe", async () => {
    const utilisateur = buildUtilisateur({ actif: false });
    const result = await authenticate(utilisateur, "bon-mot-de-passe", createFakeHasher());
    expect(result).toEqual({ success: false, reason: "USER_INACTIVE" });
  });

  it("retourne le rôle Administrateur correctement", async () => {
    const utilisateur = buildUtilisateur({ role: "administrateur" });
    const result = await authenticate(utilisateur, "bon-mot-de-passe", createFakeHasher());
    expect(result).toEqual({ success: true, userId: "u1", role: "administrateur" });
  });

  it("retourne le rôle Gérant correctement", async () => {
    const utilisateur = buildUtilisateur({ role: "gerant" });
    const result = await authenticate(utilisateur, "bon-mot-de-passe", createFakeHasher());
    expect(result).toEqual({ success: true, userId: "u1", role: "gerant" });
  });

  it("fonctionne sans aucune opération réseau — preuve du fonctionnement hors-ligne (§8)", async () => {
    // Ce test ne fait la preuve de rien de plus que sa propre exécution :
    // authenticate() ne prend aucun paramètre réseau, n'importe aucun
    // module de requête HTTP, et sa signature ne peut structurellement
    // pas dépendre d'une connexion. Documenté ici explicitement pour
    // qu'un futur changement qui introduirait une dépendance réseau fasse
    // échouer ce test de non-régression.
    const utilisateur = buildUtilisateur();
    const result = await authenticate(utilisateur, "bon-mot-de-passe", createFakeHasher());
    expect(result.success).toBe(true);
  });
});
