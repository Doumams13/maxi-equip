import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";

/**
 * Base de données locale chiffrée (SQLCipher via better-sqlite3-multiple-ciphers).
 *
 * Décisions appliquées ici (Synthèse §2/§8, Corrections §2) :
 * - Clé aléatoire de 256 bits, générée une seule fois à la première utilisation.
 * - Jamais écrite en clair sur disque : chiffrée via safeStorage (DPAPI Windows).
 * - Récupérée en mémoire uniquement, au démarrage, jamais persistée ailleurs.
 * - En cas de remplacement de poste : ce module ne tente jamais de réutiliser
 *   un ancien fichier de clé chiffré sur une autre machine (la clé DPAPI ne
 *   serait de toute façon pas déchiffrable) — voir procédure de restauration,
 *   Corrections §6, qui repart systématiquement du cloud dans ce cas.
 */

let db: Database.Database | null = null;

function getUserDataDir(): string {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getOrCreateEncryptionKey(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // Signalé explicitement plutôt que de dégrader silencieusement la sécurité :
    // sans coffre-fort OS disponible, on refuse de démarrer avec une base non protégée.
    throw new Error(
      "Le coffre-fort sécurisé du système (safeStorage) n'est pas disponible sur ce poste. " +
        "L'application ne peut pas garantir le chiffrement de la base locale et refuse de démarrer."
    );
  }

  const keyPath = join(getUserDataDir(), "db.key");

  if (existsSync(keyPath)) {
    const encrypted = readFileSync(keyPath);
    return safeStorage.decryptString(encrypted);
  }

  // Génère une clé aléatoire de 256 bits (32 octets), encodée en hexadécimal.
  const randomKey = randomBytes(32).toString("hex");
  const encrypted = safeStorage.encryptString(randomKey);
  writeFileSync(keyPath, encrypted);
  return randomKey;
}

export function openDatabase(): Database.Database {
  if (db) return db;

  const dbPath = join(getUserDataDir(), "maxi-equip.sqlite");
  const key = getOrCreateEncryptionKey();

  const instance = new Database(dbPath);
  instance.pragma(`key='${key}'`);
  // Vérifie que la clé est bien acceptée (lève une erreur sinon) avant de continuer.
  instance.pragma("cipher_version");

  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");

  db = instance;
  return instance;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
