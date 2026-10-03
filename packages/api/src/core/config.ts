/**
 * Configuration du secret de signature JWT — correction "Phase 3.5 —
 * Sécurisation de l'API", Partie 3.
 *
 * RÈGLE ABSOLUE : jamais de secret codé en dur, jamais exposé au
 * client, jamais commité. Toujours lu depuis `JWT_SIGNING_SECRET`
 * (variable d'environnement, déjà documentée dans `.env.example`
 * depuis la Phase 0, jamais renseignée jusqu'ici).
 *
 * Développement/test : une valeur par défaut STABLE est utilisée si la
 * variable n'est pas définie — permet aux tests automatisés et au
 * développement local de fonctionner sans configuration manuelle,
 * jamais un obstacle inutile (Partie 3 : "ne pas casser les tests
 * existants"). Cette valeur n'a aucune valeur de sécurité réelle et
 * n'est JAMAIS utilisée si `MAXI_EQUIP_ENV=production`.
 *
 * Production : la variable DOIT être définie explicitement — l'API
 * refuse de démarrer/signer/vérifier un jeton plutôt que d'utiliser une
 * valeur par défaut connue publiquement (le code de ce projet est lisible
 * par quiconque a accès au dépôt).
 */

const SECRET_DEV_PAR_DEFAUT = "dev-only-insecure-secret-never-use-in-production";

export class ConfigurationSecuriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationSecuriteError";
  }
}

export function getJwtSecret(): string {
  const environnement = process.env["MAXI_EQUIP_ENV"] ?? "development";
  const secretConfigure = process.env["JWT_SIGNING_SECRET"];

  if (secretConfigure && secretConfigure.trim().length > 0) {
    return secretConfigure;
  }

  if (environnement === "production") {
    throw new ConfigurationSecuriteError(
      "JWT_SIGNING_SECRET doit être défini explicitement en production. Aucune valeur par défaut n'est utilisée pour cet environnement — voir .env.example."
    );
  }

  // Développement et test uniquement.
  return SECRET_DEV_PAR_DEFAUT;
}

/**
 * URL publique de base de l'API — correction "Intégration Site Phase 5"
 * (images catalogue) : utilisée pour construire les URLs absolues
 * renvoyées au site public (`GET /v1/public/images?file=...`), qui
 * tourne sur une autre origine et a donc besoin d'une URL complète,
 * jamais un chemin relatif au serveur API. Valeur de secours stable en
 * développement (même principe que `getJwtSecret`) — DOIT être définie
 * explicitement en production (voir .env.example).
 */
export function getPublicApiBaseUrl(): string {
  const environnement = process.env["MAXI_EQUIP_ENV"] ?? "development";
  const configuree = process.env["PUBLIC_API_BASE_URL"];
  if (configuree && configuree.trim().length > 0) {
    return configuree.replace(/\/$/, "");
  }
  if (environnement === "production") {
    throw new ConfigurationSecuriteError(
      "PUBLIC_API_BASE_URL doit être défini explicitement en production — voir .env.example."
    );
  }
  return `http://localhost:${process.env["PORT"] ?? 8787}`;
}

export interface B2RecuperationConfig {
  bucket: string;
  endpoint: string;
  keyId: string;
  applicationKey: string;
}

/**
 * Identifiants B2 EN LECTURE SEULE, dédiés au serveur, pour générer des
 * URLs de téléchargement présignées vers la dernière sauvegarde SQLite du
 * PC Shop (préfixe "sqlite/") lors d'une restauration d'installation.
 * DISTINCTS des identifiants d'ÉCRITURE que l'app Electron utilise pour
 * uploader ses sauvegardes (voir packages/electron-app CLOUD_BACKUP_*) —
 * jamais la même clé des deux côtés (le PC Shop ne doit jamais pouvoir
 * lire/lister les sauvegardes, seulement en déposer).
 *
 * Fonctionnalité optionnelle : retourne `null` si non configuré, dans
 * n'importe quel environnement (contrairement à JWT_SIGNING_SECRET), pour
 * ne jamais empêcher le serveur de démarrer tant que ces clés B2 ne sont
 * pas encore provisionnées — la route de récupération répond simplement
 * "non disponible" dans ce cas, plutôt que de faire planter tout le serveur.
 */
export function getB2RecuperationConfig(): B2RecuperationConfig | null {
  const bucket = process.env["RECUPERATION_B2_BUCKET"];
  const endpoint = process.env["RECUPERATION_B2_ENDPOINT"];
  const keyId = process.env["RECUPERATION_B2_KEY_ID"];
  const applicationKey = process.env["RECUPERATION_B2_APPLICATION_KEY"];
  if (!bucket || !endpoint || !keyId || !applicationKey) return null;
  return { bucket, endpoint, keyId, applicationKey };
}
