import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Configuration de synchronisation — Phase 3.7, Partie 13, étendue par la
 * correction "récupération d'installation après vol/panne du PC Shop".
 *
 * TROIS SOURCES, PAR ORDRE DE PRIORITÉ :
 *  1. Configuration locale persistée (`sync-config.enc`, chiffrée via
 *     safeStorage/DPAPI, même principe que db/index.ts pour la clé de
 *     chiffrement SQLite) — écrite automatiquement après une restauration
 *     réussie (voir ipc/installationRecuperation.ts). Permet à l'app de
 *     fonctionner sans jamais exiger que le propriétaire édite lui-même
 *     les variables d'environnement Windows.
 *  2. Variables d'environnement (`MAXI_EQUIP_API_URL`/`MAXI_EQUIP_SYNC_JWT`)
 *     — mécanisme historique (Phase 3.7), toujours supporté pour la
 *     configuration manuelle/le développement.
 *  3. Valeur de secours : `https://api.maxi-equip.com` UNIQUEMENT pour un
 *     build packagé (`app.isPackaged`) — un poste Shop fraîchement
 *     installé sait déjà où trouver le serveur de production sans aucune
 *     configuration manuelle. En développement (non packagé), la valeur
 *     de secours reste `http://localhost:8787` comme avant — jamais un
 *     poste de développement ne doit pointer silencieusement vers la
 *     production faute de variable définie.
 */
export interface ConfigurationSync {
  apiUrl: string;
  jwt: string | null;
}

export interface ConfigurationCloudBackup {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const DEFAULT_API_URL_PRODUCTION = "https://api.maxi-equip.com";
const DEFAULT_API_URL_DEV = "http://localhost:8787";

function getFichierConfigLocale(): string {
  return join(app.getPath("userData"), "sync-config.enc");
}

interface ConfigurationLocalePersistee {
  apiUrl: string;
  jwt: string;
  cloudBackup?: ConfigurationCloudBackup;
}

function lireConfigurationLocale(): ConfigurationLocalePersistee | null {
  try {
    // `app`/`safeStorage` ne sont réellement disponibles que dans un vrai
    // processus principal Electron — absents en environnement de test
    // vitest (ce projet ne mocke jamais `electron`, voir
    // syncService.test.ts, qui appelle getConfigurationSync() sans
    // runtime Electron réel). Dégrade silencieusement vers les variables
    // d'environnement dans ce cas, exactement le comportement d'avant
    // cette étape — jamais une exception qui casserait ces tests.
    const chemin = getFichierConfigLocale();
    if (!existsSync(chemin)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const dechiffre = safeStorage.decryptString(readFileSync(chemin));
    return JSON.parse(dechiffre) as ConfigurationLocalePersistee;
  } catch {
    return null;
  }
}

/**
 * Persiste la configuration de synchronisation obtenue après une
 * restauration réussie (voir ipc/installationRecuperation.ts) — appelée
 * UNE FOIS, jamais par l'utilisateur directement. Écrase silencieusement
 * toute configuration locale précédente.
 */
export function definirConfigurationSyncLocale(config: ConfigurationLocalePersistee): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Le coffre-fort sécurisé du système (safeStorage) n'est pas disponible sur ce poste — impossible de stocker la configuration de synchronisation en sécurité."
    );
  }
  const dossier = app.getPath("userData");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chiffre = safeStorage.encryptString(JSON.stringify(config));
  writeFileSync(getFichierConfigLocale(), chiffre);
}

export function getConfigurationSync(): ConfigurationSync {
  const local = lireConfigurationLocale();
  if (local) {
    return { apiUrl: local.apiUrl, jwt: local.jwt };
  }

  // Même garde qu'au-dessus : `app` peut être indisponible hors d'un vrai
  // runtime Electron (tests vitest) — jamais un accès direct non protégé.
  let estPackage = false;
  try {
    estPackage = app.isPackaged;
  } catch {
    estPackage = false;
  }
  const defautApiUrl = estPackage ? DEFAULT_API_URL_PRODUCTION : DEFAULT_API_URL_DEV;
  return {
    apiUrl: process.env["MAXI_EQUIP_API_URL"] ?? defautApiUrl,
    jwt: process.env["MAXI_EQUIP_SYNC_JWT"] ?? null,
  };
}

/**
 * Identifiants de sauvegarde cloud (CLOUD_BACKUP_*) — même principe de
 * priorité que getConfigurationSync() : la config locale persistée
 * (restaurée après un vol/panne, voir installationRecuperationService.ts)
 * prime sur les variables d'environnement (configuration manuelle
 * historique, voir main/index.ts). Retourne `null` si aucune des deux
 * sources n'est configurée — comportement inchangé pour un poste où la
 * sauvegarde cloud n'est simplement pas activée.
 */
/**
 * Plafond d'espace cloud pour les sauvegardes SQLite (audit stockage B2,
 * 2026-11-14) — ne PEUT PAS interroger le vrai plafond du compte B2 (pas
 * d'API générique pour ça via le protocole S3) : c'est donc un budget
 * propre à l'application, délibérément fixé EN DESSOUS du plafond B2
 * réel du compte (10 Go au moment de cet audit) pour laisser une marge.
 * Avec la politique de rétention cloud par défaut (7 quotidiennes + 2
 * hebdomadaires, ~750-800 Mo chacune), l'usage réel attendu est de 7 à 9
 * Go — ce plafond de 9 Go sert de garde-fou si la base grossit plus vite
 * que prévu, jamais une valeur qu'on s'attend à atteindre en usage normal.
 */
const PLAFOND_CLOUD_BACKUP_PAR_DEFAUT_OCTETS = 9 * 1024 * 1024 * 1024;

export function getPlafondCloudBackupOctets(): number {
  const valeur = process.env["CLOUD_BACKUP_PLAFOND_OCTETS"];
  const parsed = valeur ? Number(valeur) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PLAFOND_CLOUD_BACKUP_PAR_DEFAUT_OCTETS;
}

export function getConfigurationCloudBackup(): ConfigurationCloudBackup | null {
  const local = lireConfigurationLocale();
  if (local?.cloudBackup) return local.cloudBackup;

  const bucket = process.env["CLOUD_BACKUP_BUCKET"];
  const region = process.env["CLOUD_BACKUP_REGION"];
  const endpoint = process.env["CLOUD_BACKUP_ENDPOINT"];
  const accessKeyId = process.env["CLOUD_BACKUP_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["CLOUD_BACKUP_SECRET_ACCESS_KEY"];
  if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}
