import { basename, join } from "node:path";
import { statSync } from "node:fs";
import type { BackupService } from "./backupService.js";
import { S3CloudBackupProvider } from "./s3CloudBackupProvider.js";
import { CloudBackupService } from "./cloudBackupService.js";
import { getConfigurationCloudBackup, getPlafondCloudBackupOctets } from "./syncConfig.js";
import {
  noterEchecSauvegardeCloud,
  noterReussiteSauvegardeCloud,
  lireEtatSauvegardeCloud,
  initialiserDerniereReussiteSiInconnue,
  diagnostiquer,
  type DiagnosticSauvegardeCloud,
} from "./etatSauvegardeCloud.js";

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
/**
 * Verrou en mémoire — protection contre deux envois cloud qui se
 * chevaucheraient dans CE processus (audit stockage B2, 2026-11-14).
 *
 * ANALYSE (pourquoi un verrou interprocessus n'est PAS nécessaire ici) :
 * la création LOCALE du backup (`creerSauvegardeAutomatiqueSiNecessaire`,
 * appelée synchrone dans `declencherSauvegardeAutoEtCloudSiNecessaire`
 * ci-dessous) s'auto-protège déjà — Node étant mono-thread, deux appels
 * ne peuvent jamais s'exécuter en parallèle, et le second verra toujours
 * le backup local que le premier vient de créer (seuil de 24h déjà
 * franchi). Les doublons réellement observés le 17 et le 21 octobre
 * dataient d'AVANT cette garde (système introduit le 28/10) et
 * correspondent à des LANCEMENTS DISTINCTS de l'application (processus
 * différents, état local indépendant) — aucun verrou dans un seul
 * processus ne peut empêcher ça. Ce verrou reste une protection en
 * défense en profondeur pour l'envoi cloud lui-même (async, donc pas
 * protégé par le mono-threading de la même façon), pas un correctif du
 * problème historique.
 */
let sauvegardeCloudEnCours = false;

export async function envoyerBackupVersCloudSiConfigure(cheminDossierBackup: string): Promise<void> {
  // Config locale persistée (restaurée après un vol/panne) en priorité,
  // sinon variables d'environnement — voir syncConfig.ts. Comportement
  // inchangé si aucune des deux n'est configurée (jamais une erreur).
  const config = getConfigurationCloudBackup();
  if (!config) return;

  if (sauvegardeCloudEnCours) {
    // eslint-disable-next-line no-console
    console.error("[backup-cloud] un envoi est déjà en cours, ce déclenchement est ignoré (jamais un envoi concurrent).");
    return;
  }
  sauvegardeCloudEnCours = true;

  try {
    const provider = new S3CloudBackupProvider({
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      // BUG RÉEL CORRIGÉ (audit stockage B2, 2026-11-14) : jamais passé
      // ici jusqu'ici, alors que `S3CloudBackupConfig` le prévoit déjà
      // (voir s3CloudBackupProvider.ts) — l'absence fait retomber le SDK
      // AWS sur l'adressage "virtual-hosted-style" par défaut
      // (`bucket.endpoint`), qui échoue silencieusement (connexion
      // bloquée, jamais d'erreur explicite) contre un service S3-
      // compatible non-AWS servant uniquement du "path-style"
      // (`endpoint/bucket`) — c'est le cas de B2 et du serveur de test
      // s3rver utilisé par les tests réels de ce fichier. Toujours vrai
      // ici : ce provider ne parle jamais à AWS S3 lui-même, uniquement
      // à un point de terminaison personnalisé (voir CLOUD_BACKUP_ENDPOINT).
      forcePathStyle: true,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
    const service = new CloudBackupService(provider);
    const nomBackup = basename(cheminDossierBackup);

    // Gestion d'espace AVANT toute tentative d'upload (point 6, audit du
    // 2026-11-14) — jamais de libération d'espace automatique ici : si
    // insuffisant, on interrompt plutôt que de supprimer pour compenser
    // (règle impérative — voir cloudBackupService.ts).
    const tailleNouvelleSauvegardeOctets = statSync(join(cheminDossierBackup, "database.sqlite")).size;
    const plafondOctets = getPlafondCloudBackupOctets();
    const espace = await service.verifierEspaceCloudSuffisant(tailleNouvelleSauvegardeOctets, plafondOctets);
    if (!espace.suffisant) {
      // eslint-disable-next-line no-console
      console.error(
        "[backup-cloud] espace cloud insuffisant pour cette sauvegarde, envoi annulé (aucune suppression automatique) :",
        { ...espace, nomBackup }
      );
      noterEchecSauvegardeCloud("Espace de stockage cloud insuffisant : la sauvegarde n'a pas été envoyée.");
      return;
    }

    const resultat = await service.sauvegarderVersLeCloud(cheminDossierBackup, nomBackup);
    if (!resultat.success) {
      // eslint-disable-next-line no-console
      console.error("[backup-cloud] envoi impossible :", resultat.message);
      noterEchecSauvegardeCloud(resultat.message ?? "Envoi impossible.");
      return; // jamais de purge après un échec d'upload ou de vérification.
    }

    noterReussiteSauvegardeCloud();
    // Purge UNIQUEMENT après succès + vérification d'intégrité déjà
    // effectuée dans sauvegarderVersLeCloud (règle impérative).
    await service.purgerAnciennesSauvegardesCloud();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[backup-cloud] envoi impossible :", err instanceof Error ? err.message : err);
    noterEchecSauvegardeCloud(err instanceof Error ? err.message : "Erreur inattendue pendant l'envoi.");
  } finally {
    sauvegardeCloudEnCours = false;
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
/**
 * Indicateur de la barre du haut (2026-11-24) — diagnostic de la
 * sauvegarde cloud. Si ce poste n'a encore aucun historique local (mise à
 * jour depuis une version antérieure), la date de la sauvegarde la plus
 * récente réellement présente dans le cloud est lue UNE fois pour
 * initialiser l'état — jamais à chaque appel.
 */
let initialisationCloudFaite = false;
export async function diagnosticSauvegardeCloud(): Promise<DiagnosticSauvegardeCloud> {
  const config = getConfigurationCloudBackup();
  if (config && !initialisationCloudFaite && !lireEtatSauvegardeCloud().derniereReussite) {
    initialisationCloudFaite = true;
    try {
      const provider = new S3CloudBackupProvider({
        bucket: config.bucket,
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: true,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      });
      const entrees = await new CloudBackupService(provider).listerSauvegardesCloudDetaillees();
      const plusRecente = entrees.map((e) => e.createdAt).sort().pop() ?? null;
      initialiserDerniereReussiteSiInconnue(plusRecente);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[backup-cloud] lecture de la dernière sauvegarde cloud impossible :", err instanceof Error ? err.message : err);
    }
  }
  return diagnostiquer(lireEtatSauvegardeCloud(), config !== null);
}

/**
 * Nouvelle tentative d'envoi (0.12.5, 2026-11-24) — jusqu'ici, l'envoi
 * cloud n'était tenté qu'au moment où une NOUVELLE sauvegarde locale
 * automatique était créée (une fois par 24 h) : après un échec (ex. B2
 * plein), plus rien n'était retenté avant le lendemain. Désormais, à
 * chaque synchronisation, si la sauvegarde locale la plus récente est
 * plus récente que la dernière réussite cloud connue, elle est renvoyée
 * TELLE QUELLE (jamais une nouvelle sauvegarde créée pour ça), au plus
 * une fois toutes les DELAI_ENTRE_TENTATIVES_MS.
 */
export const DELAI_ENTRE_TENTATIVES_MS = 15 * 60 * 1000;
let derniereTentativeRenvoi = 0;

export function doitRenvoyerDerniereSauvegarde(
  derniereLocaleCreatedAt: string | null,
  derniereReussiteCloud: string | null,
  configuree: boolean,
  derniereTentative: number,
  maintenant: number
): boolean {
  if (!configuree || !derniereLocaleCreatedAt) return false;
  if (maintenant - derniereTentative < DELAI_ENTRE_TENTATIVES_MS) return false;
  if (!derniereReussiteCloud) return true;
  return new Date(derniereLocaleCreatedAt).getTime() > new Date(derniereReussiteCloud).getTime();
}

export function declencherSauvegardeAutoEtCloudSiNecessaire(
  backupService: Pick<BackupService, "creerSauvegardeAutomatiqueSiNecessaire"> & Partial<Pick<BackupService, "listerSauvegardesAutomatiques">>
): void {
  try {
    const resultat = backupService.creerSauvegardeAutomatiqueSiNecessaire();
    if (resultat?.success && resultat.chemin) {
      derniereTentativeRenvoi = Date.now();
      void envoyerBackupVersCloudSiConfigure(resultat.chemin);
      return;
    }
    // Aucune nouvelle sauvegarde locale : renvoi de la dernière si le cloud n'a pas réussi à la recevoir.
    const derniere = backupService.listerSauvegardesAutomatiques?.()[0];
    if (
      derniere &&
      doitRenvoyerDerniereSauvegarde(
        derniere.createdAt,
        lireEtatSauvegardeCloud().derniereReussite,
        getConfigurationCloudBackup() !== null,
        derniereTentativeRenvoi,
        Date.now()
      )
    ) {
      derniereTentativeRenvoi = Date.now();
      void envoyerBackupVersCloudSiConfigure(derniere.chemin);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[backup-auto] sauvegarde déclenchée par la synchronisation impossible :", err instanceof Error ? err.message : err);
  }
}
