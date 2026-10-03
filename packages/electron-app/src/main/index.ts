import { app, BrowserWindow, dialog, session, Menu } from "electron";
import { join, basename } from "node:path";
import { closeDatabase, openDatabase, getEncryptionKey, getDatabasePath } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { registerIpcHandlers } from "./ipc/index.js";
import { registerAuthIpcHandlers } from "./ipc/auth.js";
import { getSecureWebPreferences, CONTENT_SECURITY_POLICY } from "./security/windowOptions.js";
import { restrictNavigation } from "./security/restrictNavigation.js";
import { Argon2idPasswordHasher } from "./auth/argon2Hasher.js";
import { UtilisateurRepository } from "./auth/utilisateurRepository.js";
import { SessionManager } from "./auth/sessionManager.js";
import { AuthService } from "./auth/authService.js";
import { registerSetupIpcHandlers } from "./ipc/setup.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "./repositories/emplacementRepository.js";
import { ProduitRepository } from "./repositories/produitRepository.js";
import { StockRepository } from "./repositories/stockRepository.js";
import { MouvementRepository } from "./repositories/mouvementRepository.js";
import { FactureRepository } from "./repositories/factureRepository.js";
import { ParametresRepository } from "./repositories/parametresRepository.js";
import { BoiteEnvoiRepository } from "./repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "./repositories/syncRepository.js";
import { SyncService } from "./services/syncService.js";
import { registerSyncIpcHandlers } from "./ipc/sync.js";
import { BackupService } from "./services/backupService.js";
import { S3CloudBackupProvider } from "./services/s3CloudBackupProvider.js";
import { CloudBackupService } from "./services/cloudBackupService.js";
import { registerBackupIpcHandlers } from "./ipc/backup.js";
import { BackupRestoreService } from "./services/backupRestoreService.js";
import { registerBackupRestoreIpcHandlers } from "./ipc/backupRestore.js";
import { registerInstallationRecuperationIpcHandlers } from "./ipc/installationRecuperation.js";
import { registerAutoUpdateIpcHandlers } from "./ipc/autoUpdate.js";
import { getConfigurationCloudBackup } from "./services/syncConfig.js";
import { DemandeRepository } from "./repositories/demandeRepository.js";
import { NotificationRepository } from "./repositories/notificationRepository.js";
import { DemandeService } from "./services/demandeService.js";
import { registerDemandeIpcHandlers } from "./ipc/demandes.js";
import { injecterDemandeTest } from "./maintenance/injecterDemandeTest.js";
import { StockService } from "./services/stockService.js";
import { VenteService } from "./services/venteService.js";
import { registerMetierIpcHandlers } from "./ipc/metier.js";
import { ImageProduitRepository } from "./repositories/imageProduitRepository.js";
import { ImageService } from "./services/imageService.js";
import { registerImageIpcHandlers } from "./ipc/images.js";
import { executerResetDonneesTest } from "./maintenance/resetDonneesTest.js";
import { executerGenerationDonneesTest } from "./maintenance/genererDonneesTest.js";
import { UtilisateurService } from "./services/utilisateurService.js";
import { registerUtilisateursIpcHandlers } from "./ipc/utilisateurs.js";
import { ModeleRepository } from "./repositories/modeleRepository.js";
import { PromotionRepository } from "./repositories/promotionRepository.js";
import { PromotionService } from "./services/promotionService.js";
import { registerPromotionsIpcHandlers } from "./ipc/promotions.js";

// Le processus principal est construit en CommonJS (voir electron.vite.config.ts)
// — __dirname est donc nativement disponible, pas besoin de la variante ESM
// (import.meta.url) qui compliquerait inutilement la sortie CJS attendue par
// Electron pour un preload/main compatibles avec le mode "sandbox: true".

// En développement, electron-vite fournit l'URL du serveur Vite ; en
// production, le renderer est chargé depuis les fichiers empaquetés.
const RENDERER_DEV_SERVER_URL = process.env["ELECTRON_RENDERER_URL"];

/**
 * Taille INITIALE par défaut de la fenêtre — pas une taille verrouillée.
 * L'utilisateur peut librement redimensionner, maximiser, utiliser le
 * Snap Windows, etc. (revirement explicite par rapport à une version
 * précédente qui verrouillait la fenêtre pendant l'écran de connexion).
 */
const DEFAULT_WINDOW_SIZE = { width: 1280, height: 720 };

/**
 * Taille minimale — déterminée à partir du contenu réel de l'écran de
 * connexion (packages/electron-app/src/renderer/LoginScreen.tsx), pas
 * choisie arbitrairement : la carte de connexion a une largeur maximale
 * de 420px, entourée d'un espacement de 24px de chaque côté (468px de
 * large minimum), et son contenu vertical (logo, titre, deux champs,
 * bouton, séparateur, bouton secondaire, marges de la carte) nécessite
 * environ 600px de hauteur avant d'ajouter l'espacement extérieur. Une
 * marge de sécurité est ajoutée pour éviter tout débordement au pixel
 * près sur différents systèmes de mise à l'échelle Windows.
 */
const MIN_WINDOW_SIZE = { width: 520, height: 680 };

function createMainWindow(): BrowserWindow {
  const preloadDir = join(__dirname, "../preload");

  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    center: true,
    show: false,
    webPreferences: getSecureWebPreferences(preloadDir),
  });

  restrictNavigation(window);

  // Raccourci manuel pour les outils de développement (F12 ou
  // Ctrl/Cmd+Shift+I) — nécessaire depuis le retrait du menu générique
  // d'Electron (Menu.setApplicationMenu(null)) : ce raccourci était
  // auparavant fourni par l'entrée de menu "Affichage > Outils de
  // développement" et a cessé de fonctionner en même temps que le menu.
  window.webContents.on("before-input-event", (_event, input) => {
    const combinaisonDevTools = input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i");
    if (combinaisonDevTools) window.webContents.toggleDevTools();
  });

  // Relaie les logs du Renderer vers la console du Main Process — utile en
  // développement pour diagnostiquer sans ouvrir les DevTools. Désactivé
  // en production (app empaquetée) pour ne jamais faire fuiter de contenu
  // d'interface dans les journaux système.
  if (!app.isPackaged) {
    window.webContents.on("console-message", (_event, _level, message) => {
      // eslint-disable-next-line no-console
      console.log("[renderer]", message);
    });
  }

  window.once("ready-to-show", () => {
    // Démarre maximisée (correction : "l'écran de connexion était coupé
    // au lancement" — 1280×720 fixe ne suffit pas sur tous les postes,
    // notamment avec la barre des tâches Windows ou une mise à l'échelle
    // différente de 100%). `show: false` + ce moment précis évitent tout
    // scintillement (fenêtre visible directement dans sa taille finale).
    window.maximize();
    window.show();
  });

  if (RENDERER_DEV_SERVER_URL) {
    void window.loadURL(RENDERER_DEV_SERVER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

function applyContentSecurityPolicy(): void {
  // En dev, Vite injecte un script inline pour le HMR React (preamble) que
  // la CSP bloquerait. On l'applique uniquement en production.
  if (RENDERER_DEV_SERVER_URL) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

/**
 * Correction Phase Finale, Bloc 4 (remédiation pré-production — backup
 * cloud) — envoie une sauvegarde AUTOMATIQUE déjà créée localement vers
 * un stockage cloud, UNIQUEMENT si les variables `CLOUD_BACKUP_*` sont
 * configurées (voir .env.example). Réutilise tel quel le dossier produit
 * par `BackupService` (jamais une seconde logique de sauvegarde/
 * chiffrement — voir cloudBackupService.ts). Best-effort : jamais
 * bloquant, jamais remonté à l'utilisateur (le prochain backup
 * automatique retentera naturellement dans 24h).
 */
async function envoyerBackupVersCloudSiConfigure(cheminDossierBackup: string): Promise<void> {
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

app.whenReady().then(async () => {
  // --- Mode maintenance (correction "Tests réels Phase 2") ---
  // Jamais une fonctionnalité de l'application elle-même : aucun menu,
  // aucun bouton, aucune trace dans l'interface normale. Activé
  // UNIQUEMENT par un drapeau de ligne de commande explicite, pour
  // permettre de réinitialiser/générer des données de test sans ouvrir
  // de fenêtre. Le démarrage normal de l'application n'emprunte jamais
  // ce chemin (aucun de ces drapeaux n'est présent en usage normal).
  //
  // BLOQUANT CORRIGÉ (audit Phase Finale, pré-production) : `--maintenance=
  // reset-donnees-test --confirmer` supprime réellement les données
  // transactionnelles (factures, ventes, stock...) SANS AUCUNE
  // authentification — atteignable depuis la ligne de commande sur
  // n'importe quel exécutable installé. Jamais un problème en
  // développement (outil de test volontaire), mais une porte de
  // destruction de données réelles si elle restait accessible sur un
  // exécutable livré au client. Désormais refusée dans un build empaqueté
  // (`app.isPackaged`) — même principe déjà appliqué au relais des logs du
  // Renderer un peu plus bas dans ce fichier, jamais un mécanisme inédit.
  const argMaintenance = app.isPackaged ? undefined : process.argv.find((a) => a.startsWith("--maintenance="));
  if (argMaintenance) {
    const mode = argMaintenance.split("=")[1];
    const db = openDatabase();
    runMigrations(db);
    try {
      if (mode === "reset-donnees-test") {
        const confirmer = process.argv.includes("--confirmer");
        const inclureProduits = process.argv.includes("--inclure-produits");
        const resultat = executerResetDonneesTest(db, { confirmer, inclureProduits });
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(resultat, null, 2));
        if (resultat.simulation) {
          // eslint-disable-next-line no-console
          console.log("\nSIMULATION UNIQUEMENT — aucune donnée supprimée. Relancer avec --confirmer pour supprimer réellement.");
        }
      } else if (mode === "generer-donnees-test") {
        const resultat = executerGenerationDonneesTest(db);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(resultat, null, 2));
      } else if (mode === "injecter-demande-test") {
        const produitArg = process.argv.find((a) => a.startsWith("--produit-id="));
        const produitId = produitArg ? produitArg.split("=")[1]! : (db.prepare("SELECT id FROM produits LIMIT 1").get() as { id: string } | undefined)?.id;
        const varianteArg = process.argv.find((a) => a.startsWith("--variante="));
        const variante = varianteArg ? (Number(varianteArg.split("=")[1]) as 1 | 2 | 3) : 1;
        if (!produitId) {
          // eslint-disable-next-line no-console
          console.error("Aucun produit disponible pour l'injection — créez au moins un produit ou passez --produit-id=<id>.");
        } else {
          const resultat = await injecterDemandeTest(db, produitId, [1, 2, 3].includes(variante) ? variante : 1);
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(resultat, null, 2));
        }
      } else {
        // eslint-disable-next-line no-console
        console.error(`Mode maintenance inconnu : "${mode}". Modes valides : reset-donnees-test, generer-donnees-test, injecter-demande-test.`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Échec de l'opération de maintenance :", err);
    } finally {
      closeDatabase();
      app.quit();
    }
    return;
  }

  // Retire le menu générique d'Electron ("File Edit View Window Help") —
  // jamais voulu pour MAXI EQUIP, il n'a aucun rôle ici. En plus d'être
  // hors charte graphique, sa hauteur n'était pas comptée dans le calcul
  // de la fenêtre (min 680px), ce qui coupait le bas de l'écran de
  // connexion (ex. bouton "Quitter l'application") sur une fenêtre
  // réduite. `null` supprime la barre entièrement, sur toutes les
  // fenêtres de l'application (Windows/Linux ; sans effet sur macOS où
  // le menu vit dans la barre système, hors sujet ici).
  Menu.setApplicationMenu(null);

  applyContentSecurityPolicy();

  let mainWindow: BrowserWindow;
  try {
    const db = openDatabase();
    runMigrations(db);
    registerIpcHandlers(db);

    // Authentification (Phase 1) : dépôt SQLite + hasher Argon2id réel +
    // session en mémoire, assemblés par le service d'authentification.
    const utilisateurRepository = new UtilisateurRepository(db);
    const hasher = new Argon2idPasswordHasher();
    const sessionManager = new SessionManager();
    const authService = new AuthService(utilisateurRepository, hasher, sessionManager);

    registerAuthIpcHandlers(authService);

    // Gestion des utilisateurs (Phase N) — réservé aux administrateurs,
    // vérifié côté Main à chaque appel IPC (§13 : jamais uniquement l'UI).
    const utilisateurService = new UtilisateurService(utilisateurRepository, hasher);
    registerUtilisateursIpcHandlers(utilisateurService, sessionManager);

    // Configuration initiale (Phase 6C) — remplace l'ancien bootstrap à
    // mot de passe généré aléatoirement (abandonné). Plus aucun compte
    // n'est créé automatiquement : le Renderer affiche un écran de
    // configuration initiale tant que `setup:estRequis` répond `true`
    // (c'est-à-dire tant qu'aucun utilisateur n'existe — le même signal
    // déterministe qu'avant, jamais un second indicateur "initialisé"
    // dupliqué), et crée l'Administrateur via le SEUL service déjà
    // existant (`UtilisateurService.creerUtilisateur`), jamais une
    // seconde logique de création de compte.
    registerSetupIpcHandlers(utilisateurRepository, utilisateurService);

    // Métier (Phase 2) : dépôts + services assemblant les règles du
    // domaine (§19 : le domaine reste la seule source de vérité).
    const emplacementRepository = new EmplacementRepository(db);
    const produitRepository = new ProduitRepository(db);
    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const factureRepository = new FactureRepository(db);
    const parametresRepository = new ParametresRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    const syncRepository = new SyncRepository(db);
    const modeleRepository = new ModeleRepository(db);
    const promotionRepository = new PromotionRepository(db);
    const promotionService = new PromotionService(db, promotionRepository, boiteEnvoiRepository);
    registerPromotionsIpcHandlers(promotionService, sessionManager);

    const stockService = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository);
    const venteService = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, promotionRepository, parametresRepository);

    // Demandes du site (Phase 4.1) : instanciés AVANT SyncService pour
    // que celui-ci puisse recevoir le callback d'application réelle des
    // opérations "demande" reçues via PULL (Partie 4/17) — jamais un
    // couplage inverse, DemandeService ne connaît jamais SyncService.
    const demandeRepository = new DemandeRepository(db);
    const notificationRepository = new NotificationRepository(db);
    // Correction "Workflow réel des demandes" : venteService n'est plus une dépendance de DemandeService — la demande alimente Vente, jamais l'inverse.
    const demandeService = new DemandeService(demandeRepository, notificationRepository, stockRepository);

    const syncService = new SyncService(boiteEnvoiRepository, syncRepository, (payload, sourceEntityId) => {
      const p = payload as {
        clientNom: string;
        clientTelephone: string;
        clientAdresse: string;
        clientEmail?: string | null;
        commentaire?: string | null;
        lignes: { produitId: string; motif: string; taille: string; quantite: number; prixIndicatif: number }[];
      };
      demandeService.creerDepuisReception({ ...p, sourceEntityId });
    });

    // La fenêtre doit exister avant le service d'images (le sélecteur de
    // fichiers natif s'ouvre attaché à une fenêtre — dialog.showOpenDialog).
    mainWindow = createMainWindow();
    registerAutoUpdateIpcHandlers();

    const imageProduitRepository = new ImageProduitRepository(db);
    const imageService = new ImageService(imageProduitRepository, mainWindow, boiteEnvoiRepository);

    bootstrapDefaultEmplacements(emplacementRepository);
    registerMetierIpcHandlers(
      produitRepository,
      emplacementRepository,
      stockRepository,
      mouvementRepository,
      factureRepository,
      parametresRepository,
      boiteEnvoiRepository,
      stockService,
      venteService,
      imageService,
      sessionManager,
      modeleRepository,
      promotionRepository
    );
    registerImageIpcHandlers(imageService, sessionManager);
    registerSyncIpcHandlers(syncService, sessionManager);

    // Synchronisation automatique périodique — correction "délai de
    // propagation vers le site public" : jusqu'ici, PUSH/PULL ne se
    // déclenchaient JAMAIS automatiquement (ni au démarrage, ni sur un
    // intervalle), uniquement sur clic manuel dans l'en-tête — un ajout
    // catalogue pouvait rester invisible côté site des heures durant
    // tant que personne n'y pensait. Toutes les 5 minutes (+ une fois au
    // démarrage, jamais besoin d'attendre le premier intervalle), best
    // effort : `executerSynchronisation()` a déjà son propre verrou
    // (`synchronisationEnCours`) et ne lève jamais d'exception — une
    // absence de réseau ou de jeton configuré échoue simplement en
    // silence ici, exactement comme le bouton manuel le ferait déjà.
    const INTERVALLE_SYNC_AUTOMATIQUE_MS = 5 * 60 * 1000;
    const lancerSyncAutomatique = (): void => {
      void syncService.executerSynchronisation().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[sync-auto] échec inattendu :", err instanceof Error ? err.message : err);
      });
    };
    lancerSyncAutomatique();
    setInterval(lancerSyncAutomatique, INTERVALLE_SYNC_AUTOMATIQUE_MS).unref();

    // Demandes (Phase 4.1) — Administrateur et Gérant, aucune restriction artificielle (Partie 15).
    registerDemandeIpcHandlers(demandeService, notificationRepository, sessionManager);
    // Purge (Partie 13/14) : au démarrage, jamais une tâche planifiée fragile — protégée par try/catch comme la sauvegarde automatique, un échec ne doit jamais empêcher le démarrage.
    try {
      demandeService.purgerDemandesAnciennes();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[demandes] purge des anciennes demandes impossible :", err);
    }

    // Sauvegarde (Phase 3.8) — service indépendant, jamais un accès
    // filesystem direct depuis le Renderer (Partie 13). Le déclenchement
    // automatique (Partie 10) est protégé par try/catch : un échec de
    // sauvegarde ne doit JAMAIS empêcher l'application de démarrer
    // normalement (Partie 18 : ne rien casser de l'existant).
    const backupService = new BackupService(db, getEncryptionKey(), join(app.getPath("userData"), "backups"));
    registerBackupIpcHandlers(backupService, sessionManager);
    try {
      const resultatBackupAuto = backupService.creerSauvegardeAutomatiqueSiNecessaire();
      // Bloc 4 (remédiation pré-production) — backup cloud, entièrement
      // OPT-IN : n'a strictement aucun effet si les variables
      // CLOUD_BACKUP_* ne sont pas configurées (voir .env.example),
      // exactement le même principe que les autres secours déjà établis
      // dans ce projet (JWT, CORS...). Jamais bloquant pour le
      // démarrage — un échec d'envoi cloud est journalisé, jamais
      // remonté à l'utilisateur ni retenté ici (le prochain backup
      // automatique retentera naturellement).
      if (resultatBackupAuto?.success && resultatBackupAuto.chemin) {
        void envoyerBackupVersCloudSiConfigure(resultatBackupAuto.chemin);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[backup] sauvegarde automatique impossible :", err);
    }

    // Restauration (Phase 3.9) — réutilise le même BackupService (pour la safety backup) et la même clé/chemin déjà résolus ci-dessus, jamais une seconde logique de gestion de clé.
    const restoreService = new BackupRestoreService(backupService, getEncryptionKey(), getDatabasePath(), closeDatabase);
    registerBackupRestoreIpcHandlers(restoreService, sessionManager);
    registerInstallationRecuperationIpcHandlers(utilisateurRepository, restoreService);
  } catch (err) {
    // Ne jamais planter silencieusement (ex. coffre-fort sécurisé du système
    // indisponible — cf. docs/architecture/PHASE0.md). L'utilisateur doit
    // recevoir un message clair, jamais un plantage muet.
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox(
      "MAXI EQUIP — Démarrage impossible",
      `L'application ne peut pas démarrer en toute sécurité sur ce poste :\n\n${message}\n\n` +
        "Contactez votre administrateur ou le support technique."
    );
    app.exit(1);
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  closeDatabase();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeDatabase();
});
