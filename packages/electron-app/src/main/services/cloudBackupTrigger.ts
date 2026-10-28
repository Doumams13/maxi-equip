import { basename } from "node:path";
import type { BackupService } from "./backupService.js";
import { S3CloudBackupProvider } from "./s3CloudBackupProvider.js";
import { CloudBackupService } from "./cloudBackupService.js";
import { getConfigurationCloudBackup } from "./syncConfig.js";

/**
 * Correction Phase Finale, Bloc 4 (remédiation pré-production — backup
 * cloud) — envoie une sauvegarde AUTOMATIQUE déjà créée localement vers
 * un stockage cloud, UNIQUEMENT si les variables `CLOUD_BACKUP_*` sont
 * configurées (voir .env.example). Réutilise tel quel le dossier produit
 * par `BackupService` (jamais une seconde logique de sauvegarde/
 * chiffrement — voir cloudBackupService.ts). Best-effort : jamais
 * bloquant, jamais remonté à l'utilisateur (le prochain backup
 * automatique retentera naturellement dans 24h).
 *
 * Extrait de main/index.ts (2026-10-28) — réutilisé À L'IDENTIQUE par
 * `declencherSauvegardeAutoEtCloudSiNecessaire` ci-dessous, elle-même
 * appelée depuis le cycle de synchronisation (voir son commentaire).
 */
export async function envoyerBackupVersCloudSiConfigure(cheminDossierBackup: string): Promise<void> {
  // Config locale persistée (restaurée après un vol/panne) en priorité,
  // sinon variables d'environnement — voir syncConfig.ts. Comportement
  // inchangé si aucune des deux n'est configurée (jamais une erreur).
  const config = getConfigurationCloudBackup();
  if (!config) return;

  try {
    const provider = new S3CloudBackupProvider({
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
    const resultat = await new CloudBackupService(provider).sauvegarderVersLeCloud(cheminDossierBackup, basename(cheminDossierBackup));
    if (!resultat.success) {
      // eslint-disable-next-line no-console
      console.error("[backup-cloud] envoi impossible :", resultat.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[backup-cloud] envoi impossible :", err instanceof Error ? err.message : err);
  }
}

/**
 * Système multiposte fiable (2026-10-28) — déclenché désormais à CHAQUE
 * synchronisation réussie (cycle automatique de 5 minutes, flux SSE
 * quasi instantané, ET clic manuel sur "Synchroniser"), jamais plus
 * seulement au démarrage de l'application — voir l'échange sur
 * l'incident de restauration de PC Shop (2026-10-28) : une application
 * restée ouverte plusieurs jours sans redémarrage ne produisait jamais
 * de nouvelle sauvegarde cloud entre-temps, laissant la dernière
 * sauvegarde disponible dangereusement datée au moment d'une
 * restauration réelle.
 *
 * Réutilise TEL QUEL le seuil déjà existant de `BackupService`
 * (`DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS`, 24h) — jamais une seconde
 * logique de limitation de fréquence : `creerSauvegardeAutomatiqueSiNecessaire()`
 * renvoie `null` sans rien faire si la dernière sauvegarde a moins de
 * 24h, donc la quasi-totalité des synchronisations (toutes les 5
 * minutes, ou instantanées) sont un no-op bon marché pour cette
 * fonction — seule une sur ~288 par jour (au plus) déclenche réellement
 * le travail lourd (VACUUM INTO + rechiffrement + upload).
 *
 * ATTENTION — opération SYNCHRONE et bloquante (voir
 * `BackupService.creerSauvegardeAutomatiqueSiNecessaire`, jamais
 * asynchrone) : le jour où elle se déclenche réellement, elle peut
 * bloquer le processus principal quelques secondes à plus d'une minute
 * selon la taille de la base — exactement comme déjà le cas au
 * démarrage de l'application jusqu'ici, simplement plus fréquent
 * (déclenchable pendant l'usage normal, pas seulement au lancement).
 * Appelée en "fire-and-forget" (jamais attendue par l'appelant) :
 * n'allonge jamais la réponse perçue d'un clic sur "Synchroniser", mais
 * ne retire pas non plus le blocage réel du thread principal pendant
 * son exécution.
 */
export function declencherSauvegardeAutoEtCloudSiNecessaire(backupService: Pick<BackupService, "creerSauvegardeAutomatiqueSiNecessaire">): void {
  try {
    const resultat = backupService.creerSauvegardeAutomatiqueSiNecessaire();
    if (resultat?.success && resultat.chemin) {
      void envoyerBackupVersCloudSiConfigure(resultat.chemin);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[backup-auto] sauvegarde déclenchée par la synchronisation impossible :", err instanceof Error ? err.message : err);
  }
}
