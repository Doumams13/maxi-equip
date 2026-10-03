import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { BackupRestoreService, ResultatRestauration } from "./backupRestoreService.js";
import { getConfigurationSync, definirConfigurationSyncLocale, type ConfigurationCloudBackup } from "./syncConfig.js";
import { recupererCleAvecMotDePasse, type CleProtegeeParMotDePasse } from "./backupCrypto.js";

/** Symétrique de objetVersHex() côté recuperationInstallationService.ts. */
function hexVersObjet<T>(hex: string): T {
  return JSON.parse(Buffer.from(hex, "hex").toString("utf-8")) as T;
}

/**
 * Orchestration complète de la récupération d'installation — voir
 * l'échange sur le vol du PC Shop. Contrairement à `backup:restore-*`
 * (ipc/backupRestore.ts), n'exige JAMAIS de session Administrateur déjà
 * ouverte : c'est justement le mécanisme qui en tient lieu pour une
 * installation fraîche, où aucun compte local n'existe encore (voir le
 * garde `estSetupRequis()` dans le handler IPC qui appelle ceci).
 *
 * Réutilise le format de sauvegarde manuelle existant
 * (`BackupRestoreService.executerRestauration`, qui attend un dossier
 * avec `database.sqlite` + `metadata.json`, ce dernier contenant
 * `database.keyProtection` pour une sauvegarde protégée par mot de
 * passe) — la sauvegarde cloud automatique ne contient PAS ce champ
 * nativement (voir cloudBackupService.ts : la clé ne quitte jamais la
 * machine d'origine), donc injecté ici après téléchargement, à partir de
 * `cleChiffreeSauvegarde` obtenu du serveur (voir
 * core/recuperationInstallationStore.ts côté API) — jamais une deuxième
 * logique de restauration inventée.
 */

export type EtapeRecuperation =
  | "aucune_recuperation_configuree"
  | "mot_de_passe_incorrect"
  | "trop_de_tentatives"
  | "aucune_sauvegarde_disponible"
  | "erreur_reseau"
  | "restauration";

export interface ResultatRecuperationInstallation {
  success: boolean;
  etape?: EtapeRecuperation;
  message?: string;
}

interface ReponseVerification {
  jwt: string;
  downloadUrls: { database: string; metadata: string; checksum: string } | null;
  cleChiffreeSauvegarde: CleProtegeeParMotDePasse | null;
  cleChiffreeCloudBackup: CleProtegeeParMotDePasse | null;
}

/**
 * Déchiffre les identifiants CLOUD_BACKUP_* reçus du serveur (voir
 * recuperationInstallationService.ts pour le chiffrement symétrique) —
 * `undefined` si absent ou si le déchiffrement échoue (mot de passe
 * différent de celui utilisé à l'envoi, ne devrait jamais arriver ici
 * puisque c'est LE MÊME mot de passe déjà vérifié par le serveur, mais
 * jamais un crash pour autant : la restauration de la base reste prioritaire).
 */
function dechiffrerCloudBackup(blob: CleProtegeeParMotDePasse | null, motDePasse: string): ConfigurationCloudBackup | undefined {
  if (!blob) return undefined;
  try {
    return hexVersObjet<ConfigurationCloudBackup>(recupererCleAvecMotDePasse(blob, motDePasse));
  } catch {
    return undefined;
  }
}

function calculerSha256(donnees: Buffer): string {
  return createHash("sha256").update(donnees).digest("hex");
}

async function telechargerBuffer(url: string): Promise<Buffer> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Téléchargement échoué (HTTP ${reponse.status}).`);
  return Buffer.from(await reponse.arrayBuffer());
}

export async function verifierEtRestaurerInstallation(
  motDePasse: string,
  restoreService: BackupRestoreService
): Promise<ResultatRecuperationInstallation> {
  const { apiUrl } = getConfigurationSync();

  let reponseHttp: Response;
  try {
    reponseHttp = await fetch(`${apiUrl}/v1/public/installation/verifier-recuperation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motDePasse }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
    return { success: false, etape: "erreur_reseau", message: `Impossible de contacter le serveur : ${message}` };
  }

  if (reponseHttp.status === 404) {
    return { success: false, etape: "aucune_recuperation_configuree", message: "Aucune récupération n'est configurée sur le serveur." };
  }
  if (reponseHttp.status === 401) {
    return { success: false, etape: "mot_de_passe_incorrect", message: "Mot de passe incorrect." };
  }
  if (reponseHttp.status === 429) {
    return { success: false, etape: "trop_de_tentatives", message: "Trop de tentatives — réessayez plus tard." };
  }
  if (!reponseHttp.ok) {
    return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponseHttp.status}).` };
  }

  const corps = (await reponseHttp.json()) as ReponseVerification;

  if (!corps.downloadUrls) {
    // Mot de passe valide, mais aucune sauvegarde cloud disponible (le
    // PC Shop n'a jamais été configuré pour la sauvegarde SQLite→B2) —
    // on configure quand même la synchronisation, jamais bloquant :
    // l'utilisateur repart sur un compte Administrateur local neuf.
    definirConfigurationSyncLocale({
      apiUrl,
      jwt: corps.jwt,
      cloudBackup: dechiffrerCloudBackup(corps.cleChiffreeCloudBackup, motDePasse),
    });
    return {
      success: false,
      etape: "aucune_sauvegarde_disponible",
      message: "Mot de passe reconnu, mais aucune sauvegarde n'est disponible sur le serveur. Configurez un nouveau compte administrateur.",
    };
  }

  const dossierTemp = join(app.getPath("temp"), `maxiequip-restauration-${randomUUID()}`);
  try {
    const [donneesBase, donneesMetadataBrut, donneesChecksum] = await Promise.all([
      telechargerBuffer(corps.downloadUrls.database),
      telechargerBuffer(corps.downloadUrls.metadata),
      telechargerBuffer(corps.downloadUrls.checksum),
    ]);

    const checksumAttendu = JSON.parse(donneesChecksum.toString("utf-8")) as { sha256: string; tailleOctets: number };
    const sha256Reel = calculerSha256(donneesBase);
    if (sha256Reel !== checksumAttendu.sha256 || donneesBase.length !== checksumAttendu.tailleOctets) {
      return { success: false, message: "Échec de l'intégrité : le fichier téléchargé ne correspond pas au SHA-256 enregistré à l'envoi." };
    }

    const metadata = JSON.parse(donneesMetadataBrut.toString("utf-8")) as { database: Record<string, unknown> };
    if (corps.cleChiffreeSauvegarde) {
      metadata.database["keyProtection"] = corps.cleChiffreeSauvegarde;
    }

    mkdirSync(dossierTemp, { recursive: true });
    writeFileSync(join(dossierTemp, "database.sqlite"), donneesBase);
    writeFileSync(join(dossierTemp, "metadata.json"), JSON.stringify(metadata));

    const resultat: ResultatRestauration = await restoreService.executerRestauration(dossierTemp, motDePasse);
    if (!resultat.success) {
      return { success: false, etape: "restauration", message: resultat.message };
    }

    // Uniquement après un succès RÉEL de la restauration locale — voir
    // commentaire d'en-tête, jamais un état intermédiaire ambigu.
    definirConfigurationSyncLocale({
      apiUrl,
      jwt: corps.jwt,
      cloudBackup: dechiffrerCloudBackup(corps.cleChiffreeCloudBackup, motDePasse),
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return { success: false, message: `Échec du téléchargement/restauration : ${message}` };
  } finally {
    if (existsSync(dossierTemp)) {
      try {
        rmSync(dossierTemp, { recursive: true, force: true });
      } catch {
        // Nettoyage best-effort — jamais faire échouer la restauration pour ça.
      }
    }
  }
}
