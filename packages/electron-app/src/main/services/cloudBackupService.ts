import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CloudBackupProvider } from "./cloudBackupProvider.js";

/**
 * Orchestration du backup cloud — Bloc 4 (remédiation pré-production).
 *
 * OBJECTIF (§ Bloc 4) : "PC SHOP → backup local, et serveur → backup
 * cloud." Ce service prend un backup LOCAL déjà produit par
 * `BackupService` (jamais une seconde logique de sauvegarde — il ne
 * lit/écrit jamais la base SQLCipher lui-même) et le pousse vers un
 * stockage distant via `CloudBackupProvider`.
 *
 * CHIFFREMENT (§ Bloc 4 : "chiffré avant upload SI NÉCESSAIRE selon le
 * mécanisme existant") : un backup automatique produit par
 * `BackupService` est déjà un fichier SQLCipher chiffré avec la clé
 * principale de l'installation, et son `metadata.json` ne contient
 * JAMAIS cette clé (ni en clair ni protégée — déjà garanti par
 * `BackupService`, jamais dupliqué ici). Aucune couche de chiffrement
 * supplémentaire n'est donc ajoutée : le fichier voyage tel quel,
 * déjà illisible sans la clé principale qui ne quitte jamais ce poste.
 *
 * INTÉGRITÉ (§ Bloc 4 : "vérifier l'intégrité") : un SHA-256 de
 * `database.sqlite` est calculé avant l'envoi et stocké à côté
 * (`checksum.json`). Une restauration vérifie ce SHA-256 sur les octets
 * réellement téléchargés — jamais considérée réussie sinon (§ Bloc 4,
 * CRITIQUE : "un upload réussi ne suffit pas").
 */

export interface ResultatCloudBackup {
  success: boolean;
  message?: string;
  cle?: string;
}

function calculerSha256(donnees: Buffer): string {
  return createHash("sha256").update(donnees).digest("hex");
}

export class CloudBackupService {
  constructor(private readonly provider: CloudBackupProvider) {}

  private clePourNom(nomBackup: string, fichier: string): string {
    return `backups/${nomBackup}/${fichier}`;
  }

  /**
   * Envoie un backup local (dossier produit par `BackupService`,
   * contenant `database.sqlite` + `metadata.json`) vers le cloud.
   * `nomBackup` est le nom du dossier local (ex.
   * "MAXI-EQUIP_BACKUP_2026-01-01_00-00-00") — réutilisé tel quel comme
   * identifiant côté cloud, jamais un second système de nommage.
   */
  async sauvegarderVersLeCloud(dossierBackupLocal: string, nomBackup: string): Promise<ResultatCloudBackup> {
    const cheminBase = join(dossierBackupLocal, "database.sqlite");
    const cheminMetadata = join(dossierBackupLocal, "metadata.json");

    if (!existsSync(cheminBase) || !existsSync(cheminMetadata)) {
      return { success: false, message: "Dossier de backup local incomplet (database.sqlite ou metadata.json manquant)." };
    }

    try {
      const donneesBase = readFileSync(cheminBase);
      const donneesMetadata = readFileSync(cheminMetadata);
      const sha256 = calculerSha256(donneesBase);
      const checksum = JSON.stringify({ sha256, tailleOctets: donneesBase.length, dateEnvoi: new Date().toISOString() });

      await this.provider.upload(this.clePourNom(nomBackup, "database.sqlite"), donneesBase);
      await this.provider.upload(this.clePourNom(nomBackup, "metadata.json"), donneesMetadata);
      await this.provider.upload(this.clePourNom(nomBackup, "checksum.json"), Buffer.from(checksum, "utf-8"));

      return { success: true, cle: `backups/${nomBackup}/` };
    } catch (err) {
      return { success: false, message: `Échec de l'envoi vers le cloud : ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Restaure un backup depuis le cloud vers un dossier local.
   * ÉCHOUE EXPLICITEMENT (jamais un faux succès) si le SHA-256 du
   * fichier téléchargé ne correspond pas à celui enregistré à l'envoi —
   * l'intégrité est vérifiée sur les octets réellement reçus, jamais
   * supposée parce que l'upload avait réussi.
   */
  async restaurerDepuisLeCloud(nomBackup: string, dossierDestination: string): Promise<ResultatCloudBackup> {
    try {
      const [donneesBase, donneesMetadata, donneesChecksum] = await Promise.all([
        this.provider.download(this.clePourNom(nomBackup, "database.sqlite")),
        this.provider.download(this.clePourNom(nomBackup, "metadata.json")),
        this.provider.download(this.clePourNom(nomBackup, "checksum.json")),
      ]);

      const checksumAttendu = JSON.parse(donneesChecksum.toString("utf-8")) as { sha256: string; tailleOctets: number };
      const sha256Reel = calculerSha256(donneesBase);
      if (sha256Reel !== checksumAttendu.sha256 || donneesBase.length !== checksumAttendu.tailleOctets) {
        return { success: false, message: "Échec de l'intégrité : le fichier téléchargé ne correspond pas au SHA-256 enregistré à l'envoi. Restauration refusée." };
      }

      if (!existsSync(dossierDestination)) mkdirSync(dossierDestination, { recursive: true });
      writeFileSync(join(dossierDestination, "database.sqlite"), donneesBase);
      writeFileSync(join(dossierDestination, "metadata.json"), donneesMetadata);

      return { success: true, cle: `backups/${nomBackup}/` };
    } catch (err) {
      return { success: false, message: `Échec de la restauration depuis le cloud : ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Liste les noms de backups disponibles côté cloud (préfixes distincts sous "backups/"). */
  async listerSauvegardesCloud(): Promise<string[]> {
    const cles = await this.provider.list("backups/");
    const noms = new Set<string>();
    for (const cle of cles) {
      const partie = cle.replace(/^backups\//, "").split("/")[0];
      if (partie) noms.add(partie);
    }
    return Array.from(noms);
  }
}
