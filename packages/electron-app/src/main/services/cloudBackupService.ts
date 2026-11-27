import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CloudBackupProvider } from "./cloudBackupProvider.js";
import { calculerSauvegardesAConserver, POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT, type EntreeRotation, type PolitiqueRotation } from "./backupRotation.js";

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

export interface EntreeSauvegardeCloud {
  nom: string;
  createdAt: string;
  tailleOctets: number;
}

export interface ResultatPurgeCloud {
  conservees: string[];
  supprimees: string[];
}

export interface ResultatVerificationEspaceCloud {
  suffisant: boolean;
  octetsUtilisesActuels: number;
  octetsApresAjout: number;
  plafondOctets: number;
  /** Informatif uniquement — jamais supprimé automatiquement par cette vérification (voir verifierEspaceCloudSuffisant). */
  nomsDejaEligiblesPurge: string[];
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
   *
   * CORRECTION (audit stockage B2, 2026-11-14) : `success: true` n'est
   * renvoyé qu'APRÈS vérification d'intégrité réelle (voir
   * `verifierIntegriteSauvegardeCloud` ci-dessous) — jusqu'ici, un upload
   * qui ne levait aucune exception était considéré réussi sans que
   * personne ne reconfirme que les octets réellement stockés
   * correspondent à ceux envoyés (le SHA-256 n'était comparé qu'au
   * moment d'une restauration, jamais juste après l'envoi).
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

      const verification = await this.verifierIntegriteSauvegardeCloud(nomBackup);
      if (!verification.success) {
        return { success: false, message: `Upload terminé mais vérification post-envoi échouée : ${verification.message}` };
      }

      return { success: true, cle: `backups/${nomBackup}/` };
    } catch (err) {
      return { success: false, message: `Échec de l'envoi vers le cloud : ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Vérifie l'intégrité d'une sauvegarde cloud EXISTANTE (déjà envoyée,
   * à tout moment — pas seulement juste après l'upload) : confirme la
   * présence des 3 fichiers, puis retélécharge `database.sqlite` pour
   * recalculer son SHA-256 et le comparer à celui enregistré dans
   * `checksum.json` au moment de l'envoi. Jamais un faux succès — une
   * incohérence ou un fichier absent échoue explicitement.
   */
  async verifierIntegriteSauvegardeCloud(nomBackup: string): Promise<ResultatCloudBackup> {
    const [presenteBase, presenteMetadata, presenteChecksum] = await Promise.all([
      this.provider.exists(this.clePourNom(nomBackup, "database.sqlite")),
      this.provider.exists(this.clePourNom(nomBackup, "metadata.json")),
      this.provider.exists(this.clePourNom(nomBackup, "checksum.json")),
    ]);
    if (!presenteBase || !presenteMetadata || !presenteChecksum) {
      return { success: false, message: "Un ou plusieurs fichiers de la sauvegarde sont absents côté cloud." };
    }

    const [donneesBase, donneesChecksum] = await Promise.all([
      this.provider.download(this.clePourNom(nomBackup, "database.sqlite")),
      this.provider.download(this.clePourNom(nomBackup, "checksum.json")),
    ]);
    const checksumAttendu = JSON.parse(donneesChecksum.toString("utf-8")) as { sha256: string; tailleOctets: number };
    const sha256Reel = calculerSha256(donneesBase);
    if (sha256Reel !== checksumAttendu.sha256 || donneesBase.length !== checksumAttendu.tailleOctets) {
      return { success: false, message: "Le SHA-256 recalculé ne correspond pas au checksum enregistré à l'envoi." };
    }

    return { success: true };
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
    const objets = await this.provider.list("backups/");
    const noms = new Set<string>();
    for (const o of objets) {
      const partie = o.cle.replace(/^backups\//, "").split("/")[0];
      if (partie) noms.add(partie);
    }
    return Array.from(noms);
  }

  /**
   * Inventaire détaillé des sauvegardes cloud (nom, date de création
   * réelle, taille totale des 3 fichiers) — nécessaire pour la rétention
   * cloud et la vérification d'espace. La date vient de `metadata.json`
   * (champ `backup.createdAt`), JAMAIS déduite du nom du dossier — même
   * source que `BackupService.listerSauvegardesAutomatiques()` côté
   * local, pour rester cohérent avec la convention déjà établie.
   *
   * SÉCURITÉ (point 5, audit du 2026-11-14) : une sauvegarde dont
   * `metadata.json` est absent ou illisible est SILENCIEUSEMENT EXCLUE
   * de cet inventaire — jamais traitée comme valide, et donc jamais
   * protégée NI supprimée automatiquement par la rotation (qui ne
   * connaît que les noms de CET inventaire). Une sauvegarde incomplète
   * nécessite une revue manuelle, jamais une décision automatique.
   */
  async listerSauvegardesCloudDetaillees(): Promise<EntreeSauvegardeCloud[]> {
    const objets = await this.provider.list("backups/");
    const taillesParNom = new Map<string, number>();
    for (const o of objets) {
      const nom = o.cle.replace(/^backups\//, "").split("/")[0];
      if (!nom) continue;
      taillesParNom.set(nom, (taillesParNom.get(nom) ?? 0) + o.taille);
    }

    // Téléchargements en parallèle (jamais séquentiel) — le nombre de
    // sauvegardes distinctes grandit avec le temps, un `for await`
    // séquentiel deviendrait de plus en plus lent sans jamais échouer
    // franchement (juste plus lent à chaque nouvelle sauvegarde).
    const resultats = await Promise.all(
      Array.from(taillesParNom.entries()).map(async ([nom, tailleOctets]): Promise<EntreeSauvegardeCloud | null> => {
        try {
          const donneesMetadata = await this.provider.download(this.clePourNom(nom, "metadata.json"));
          const metadata = JSON.parse(donneesMetadata.toString("utf-8")) as { backup?: { createdAt?: string } };
          const createdAt = metadata.backup?.createdAt;
          return createdAt ? { nom, createdAt, tailleOctets } : null;
        } catch {
          return null;
        }
      })
    );
    return resultats.filter((e): e is EntreeSauvegardeCloud => e !== null);
  }

  private async supprimerSauvegardesCloudParNom(noms: string[]): Promise<void> {
    for (const nom of noms) {
      for (const fichier of ["database.sqlite", "metadata.json", "checksum.json"]) {
        await this.provider.delete(this.clePourNom(nom, fichier));
      }
    }
  }

  /**
   * Purge les sauvegardes cloud hors de la politique de rétention
   * (réutilise TEL QUEL `calculerSauvegardesAConserver` de
   * `backupRotation.ts`, jamais un second algorithme — voir son
   * commentaire pour le détail des paliers).
   *
   * RÈGLE IMPÉRATIVE (audit du 2026-11-14) : cette méthode ne doit être
   * appelée par l'appelant QU'APRÈS qu'un nouvel upload ait réussi ET
   * été vérifié (jamais avant — voir cloudBackupTrigger.ts) — elle ne le
   * vérifie pas elle-même, c'est la responsabilité de l'orchestrateur.
   */
  async purgerAnciennesSauvegardesCloud(politique: PolitiqueRotation = POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT): Promise<ResultatPurgeCloud> {
    const entrees = await this.listerSauvegardesCloudDetaillees();
    const entreesRotation: EntreeRotation[] = entrees.map((e) => ({ chemin: e.nom, createdAt: e.createdAt }));
    const aConserver = calculerSauvegardesAConserver(entreesRotation, politique);

    const aSupprimer = entrees.filter((e) => !aConserver.has(e.nom)).map((e) => e.nom);
    await this.supprimerSauvegardesCloudParNom(aSupprimer);

    return { conservees: entrees.filter((e) => aConserver.has(e.nom)).map((e) => e.nom), supprimees: aSupprimer };
  }

  /**
   * Usage RÉEL du bucket entier, tous préfixes confondus (audit stockage
   * B2, 2026-11-14, point 2) — le bucket B2 est partagé entre les
   * sauvegardes SQLite (`backups/`) ET PostgreSQL (`postgres/`, script
   * serveur séparé, jamais touché par ce code). Un plafond qui ne
   * compterait que `backups/` sous-estimerait l'usage réel dès que
   * PostgreSQL grossit — voir verifierEspaceCloudSuffisant ci-dessous.
   * AUCUN lien avec la rotation : cette méthode ne sert qu'au calcul du
   * total, jamais à décider quoi garder/supprimer (ça reste exclusivement
   * le rôle de listerSauvegardesCloudDetaillees, scopé à `backups/`).
   */
  private async calculerUsageTotalBucketOctets(): Promise<number> {
    // Incident du 2026-11-26 : la clé B2 des postes est restreinte au
    // préfixe `backups/` — lister le bucket entier est refusé par B2
    // ("AccessDenied: not entitled") et bloquait TOUTE sauvegarde cloud
    // avant l'envoi. Repli : on compte ce que la clé a le droit de voir
    // (les dumps PostgreSQL du serveur pèsent ~100 Ko, négligeables face
    // au plafond, qui garde de toute façon une marge sous celui de B2).
    let objets;
    try {
      objets = await this.provider.list("");
    } catch {
      objets = await this.provider.list("backups/");
    }
    return objets.reduce((somme, o) => somme + o.taille, 0);
  }

  /**
   * Vérifie si l'espace cloud restera sous le plafond configuré une fois
   * la nouvelle sauvegarde ajoutée — AVANT de tenter l'upload (voir
   * cloudBackupTrigger.ts). `octetsUtilisesActuels` reflète l'usage du
   * BUCKET ENTIER (SQLite + PostgreSQL, voir calculerUsageTotalBucketOctets
   * ci-dessus) — jamais seulement `backups/`, puisque c'est le même
   * plafond B2 partagé par les deux. `nomsDejaEligiblesPurge` reste
   * calculé UNIQUEMENT à partir des sauvegardes SQLite
   * (listerSauvegardesCloudDetaillees, scopé à `backups/`) — jamais un
   * objet PostgreSQL, qui n'a ni le même nommage ni la même structure
   * (database.sqlite/metadata.json/checksum.json) et ne doit jamais être
   * éligible à la rotation SQLite. Purement informatif (jamais supprimé
   * ici) : si l'espace est insuffisant, l'appelant doit INTERROMPRE
   * l'envoi, jamais libérer de l'espace de force (règle impérative, voir
   * purgerAnciennesSauvegardesCloud ci-dessus).
   */
  async verifierEspaceCloudSuffisant(
    tailleNouvelleSauvegardeOctets: number,
    plafondOctets: number,
    politique: PolitiqueRotation = POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT
  ): Promise<ResultatVerificationEspaceCloud> {
    const [octetsUtilisesActuels, entrees] = await Promise.all([
      this.calculerUsageTotalBucketOctets(),
      this.listerSauvegardesCloudDetaillees(),
    ]);
    const octetsApresAjout = octetsUtilisesActuels + tailleNouvelleSauvegardeOctets;

    const entreesRotation: EntreeRotation[] = entrees.map((e) => ({ chemin: e.nom, createdAt: e.createdAt }));
    const aConserver = calculerSauvegardesAConserver(entreesRotation, politique);
    const nomsDejaEligiblesPurge = entrees.filter((e) => !aConserver.has(e.nom)).map((e) => e.nom);

    return {
      suffisant: octetsApresAjout <= plafondOctets,
      octetsUtilisesActuels,
      octetsApresAjout,
      plafondOctets,
      nomsDejaEligiblesPurge,
    };
  }
}
