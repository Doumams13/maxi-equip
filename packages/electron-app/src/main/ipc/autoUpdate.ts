import { ipcMain, app } from "electron";
import { autoUpdater } from "electron-updater";

export interface EtatMiseAJour {
  disponible: boolean;
  telechargee: boolean;
  version: string | null;
  /** Vrai pendant qu'une vérification (automatique ou manuelle) est en cours. */
  verificationEnCours: boolean;
  /**
   * Vrai juste après une vérification ayant conclu "aucune mise à jour" —
   * correction "bouton de mise à jour invisible/invérifiable" : sans ce
   * signal, rien ne distinguait "jamais vérifié" de "vérifié, à jour",
   * le Renderer ne pouvait donc jamais confirmer que le mécanisme
   * fonctionne réellement. Remis à `false` dès qu'une nouvelle
   * vérification démarre.
   */
  aJour: boolean;
  /** Version actuellement installée — affichée à côté du bouton de vérification manuelle. */
  versionActuelle: string;
  /**
   * Pourcentage réel de progression du téléchargement en cours (0-100),
   * `null` quand aucun téléchargement n'est en cours — correction
   * "aucun moyen de savoir si le téléchargement avance ou est bloqué".
   */
  progression: number | null;
}

/**
 * Mise à jour — remplace l'envoi manuel du nouvel installeur à chaque
 * correction (voir l'échange sur le PC Shop à l'autre bout du monde).
 * Repose sur `electron-updater` + un serveur "generic" (voir
 * `build.publish` dans package.json, pointant vers
 * https://api.maxi-equip.com/updates/, servi statiquement par Nginx —
 * jamais par l'API Node elle-même, aucune route à ajouter côté serveur).
 *
 * ENTIÈREMENT MANUEL (décision explicite de l'utilisateur — revient sur
 * un choix initial de téléchargement automatique) : SEULE la
 * VÉRIFICATION de disponibilité se fait toute seule au démarrage (une
 * simple lecture de `latest.yml`, aucun fichier déplacé sur le poste).
 * Ni le téléchargement ni l'installation ne démarrent sans un clic
 * explicite de l'utilisateur — jamais de surprise sur un poste de vente
 * en pleine journée.
 *
 * Installeur NON SIGNÉ (décision déjà actée) : `electron-updater` vérifie
 * l'intégrité via le SHA-512 embarqué dans `latest.yml`, généré
 * automatiquement au build — suffisant ici, pas besoin d'Authenticode
 * pour une mise à jour appliquée depuis une app déjà installée et de
 * confiance (aucun "Mark of the Web" contrairement à un double-clic
 * manuel sur un exe téléchargé depuis un navigateur).
 */

/**
 * État interrogé par polling depuis le Renderer (`update:etat`, toutes
 * les 15-30s) — même principe que `IndicateurNotifications`/`AppRoot`
 * (déjà en polling, jamais un canal d'événements poussés depuis Main,
 * qui n'existe nulle part ailleurs dans ce projet — pas de deuxième
 * mécanisme de communication Main→Renderer inventé pour l'occasion).
 */
let etat: EtatMiseAJour = {
  disponible: false,
  telechargee: false,
  version: null,
  verificationEnCours: false,
  aJour: false,
  versionActuelle: "",
  progression: null,
};

export function registerAutoUpdateIpcHandlers(): void {
  etat = { ...etat, versionActuelle: app.getVersion() };

  // Jamais de téléchargement ni d'installation sans action explicite —
  // voir commentaire d'en-tête.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    etat = { ...etat, disponible: true, telechargee: false, version: info.version, verificationEnCours: false, aJour: false, progression: null };
  });

  autoUpdater.on("update-not-available", () => {
    etat = { ...etat, disponible: false, telechargee: false, version: null, verificationEnCours: false, aJour: true, progression: null };
  });

  autoUpdater.on("download-progress", (progres) => {
    etat = { ...etat, progression: Math.round(progres.percent) };
  });

  autoUpdater.on("update-downloaded", (info) => {
    etat = { ...etat, disponible: true, telechargee: true, version: info.version, verificationEnCours: false, progression: null };
  });

  autoUpdater.on("error", (err) => {
    // Best-effort, jamais remonté comme une erreur bloquante à
    // l'utilisateur — une vérification échouée retentera naturellement
    // au prochain démarrage ou au prochain clic manuel.
    etat = { ...etat, verificationEnCours: false, progression: null };
    // eslint-disable-next-line no-console
    console.error("[auto-update] erreur :", err.message);
  });

  ipcMain.handle("update:etat", (): EtatMiseAJour => etat);

  // Déclenché UNIQUEMENT par un clic sur "Vérifier les mises à jour"
  // dans l'en-tête — correction "bouton invisible/invérifiable" : donne
  // une confirmation explicite ("à jour" ou "disponible") à tout moment,
  // sans attendre qu'une vraie mise à jour existe.
  ipcMain.handle("update:verifierManuellement", async () => {
    etat = { ...etat, verificationEnCours: true, aJour: false };
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      etat = { ...etat, verificationEnCours: false };
      // eslint-disable-next-line no-console
      console.error("[auto-update] vérification manuelle impossible :", err instanceof Error ? err.message : err);
    }
  });

  // Déclenché UNIQUEMENT par un clic sur "Télécharger la mise à jour"
  // dans l'en-tête — jamais automatiquement.
  ipcMain.handle("update:telecharger", async () => {
    etat = { ...etat, progression: 0 };
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      etat = { ...etat, progression: null };
      throw err;
    }
  });

  // Déclenché UNIQUEMENT par un clic sur "Redémarrer et mettre à jour" —
  // jamais automatiquement, jamais à la fermeture normale de l'app
  // (autoInstallOnAppQuit = false ci-dessus).
  ipcMain.handle("update:installerMaintenant", () => {
    autoUpdater.quitAndInstall();
  });

  // Seule action automatique : vérifier si une version existe (lecture
  // seule, aucun fichier déplacé) — jamais bloquant au démarrage (catch
  // explicite : dans un environnement non packagé/dev, electron-updater
  // lève une erreur immédiate, attendue, jamais une raison de faire
  // planter l'app).
  autoUpdater.checkForUpdates().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[auto-update] vérification impossible :", err instanceof Error ? err.message : err);
  });
}
