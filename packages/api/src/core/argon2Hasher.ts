import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Hachage Argon2id côté API — EXACTEMENT les mêmes paramètres que
 * packages/electron-app/src/main/auth/argon2Hasher.ts (mémoire 19 Mo, 2
 * itérations, parallélisme 1, sel 16 octets), jamais une seconde
 * politique de hachage inventée pour le serveur.
 *
 * Deux usages distincts :
 *  - `hasherMotDePasse` : hache un mot de passe reçu EN CLAIR — utilisé
 *    uniquement pour le mot de passe de récupération d'installation (voir
 *    core/recuperationInstallationStore.ts), où le serveur doit calculer
 *    lui-même le hash. Jamais pour les comptes utilisateurs — leur hash
 *    est déjà calculé côté Electron (voir compteStore.ts) et transmis tel
 *    quel, jamais le mot de passe en clair.
 *  - `verifierMotDePasse` : vérifie un mot de passe en clair contre un
 *    hash déjà stocké — utilisé par la récupération d'installation ET par
 *    `routes/v1/app/auth/login.ts` (comptes utilisateurs centralisés,
 *    correction "travail à distance" 2026-10-22), qui lui reçoit bien le
 *    hash Argon2id déjà calculé côté Electron.
 */
export async function hasherMotDePasse(motDePasseEnClair: string): Promise<string> {
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

export function verifierMotDePasse(motDePasseEnClair: string, hash: string): Promise<boolean> {
  return argon2Verify({ password: motDePasseEnClair, hash });
}
