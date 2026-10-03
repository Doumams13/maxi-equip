import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Hachage Argon2id côté API — EXACTEMENT les mêmes paramètres que
 * packages/electron-app/src/main/auth/argon2Hasher.ts (mémoire 19 Mo, 2
 * itérations, parallélisme 1, sel 16 octets), jamais une seconde
 * politique de hachage inventée pour le serveur. Utilisé uniquement pour
 * le mot de passe de récupération d'installation (voir
 * core/recuperationInstallationStore.ts) — jamais pour les comptes
 * utilisateurs locaux, qui restent entièrement gérés côté Electron.
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
