import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";
import type { auth } from "@maxi-equip/domain";

/**
 * Implémentation réelle du hachage de mot de passe — Argon2id (Synthèse
 * §2/§3), via `hash-wasm` (implémentation WebAssembly, sans compilation
 * native — décision délibérée après les difficultés rencontrées en
 * Phase 0 avec les modules natifs sur Windows).
 *
 * Ce fichier vit dans le processus principal (dépendance Node.js pour la
 * génération du sel aléatoire), jamais dans packages/domain qui reste
 * indépendant de toute bibliothèque cryptographique concrète (§15).
 *
 * Paramètres Argon2id retenus (recommandations OWASP pour un usage
 * desktop, ajustés pour rester rapide sur un poste de bureau standard) :
 * mémoire 19 Mo, 2 itérations, parallélisme 1, sel aléatoire 16 octets
 * par mot de passe, sortie encodée au format PHC standard
 * ($argon2id$v=19$m=...,t=...,p=...$sel$hash) qui embarque tous les
 * paramètres nécessaires à la vérification — aucune configuration
 * supplémentaire à stocker séparément.
 */
export class Argon2idPasswordHasher implements auth.PasswordHasher {
  async hash(motDePasseEnClair: string): Promise<string> {
    const salt = randomBytes(16);
    return argon2id({
      password: motDePasseEnClair,
      salt,
      parallelism: 1,
      iterations: 2,
      memorySize: 19456,
      hashLength: 32,
      outputType: "encoded",
    });
  }

  async verify(motDePasseEnClair: string, hash: string): Promise<boolean> {
    return argon2Verify({ password: motDePasseEnClair, hash });
  }
}
