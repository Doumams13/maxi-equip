import { app, BrowserWindow, dialog, session } from "electron";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { registerIpcHandlers } from "./ipc/index.js";
import { registerAuthIpcHandlers } from "./ipc/auth.js";
import { getSecureWebPreferences, CONTENT_SECURITY_POLICY } from "./security/windowOptions.js";
import { restrictNavigation } from "./security/restrictNavigation.js";
import { Argon2idPasswordHasher } from "./auth/argon2Hasher.js";
import { UtilisateurRepository } from "./auth/utilisateurRepository.js";
import { SessionManager } from "./auth/sessionManager.js";
import { AuthService } from "./auth/authService.js";
import { bootstrapDefaultUsers } from "./auth/bootstrapUsers.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "./repositories/emplacementRepository.js";
import { ProduitRepository } from "./repositories/produitRepository.js";
import { StockRepository } from "./repositories/stockRepository.js";
import { MouvementRepository } from "./repositories/mouvementRepository.js";
import { FactureRepository } from "./repositories/factureRepository.js";
import { StockService } from "./services/stockService.js";
import { VenteService } from "./services/venteService.js";
import { registerMetierIpcHandlers } from "./ipc/metier.js";

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

  window.once("ready-to-show", () => window.show());

  if (RENDERER_DEV_SERVER_URL) {
    void window.loadURL(RENDERER_DEV_SERVER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

app.whenReady().then(async () => {
  applyContentSecurityPolicy();

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

    await bootstrapDefaultUsers(utilisateurRepository, hasher);
    registerAuthIpcHandlers(authService);

    // Métier (Phase 2) : dépôts + services assemblant les règles du
    // domaine (§19 : le domaine reste la seule source de vérité).
    const emplacementRepository = new EmplacementRepository(db);
    const produitRepository = new ProduitRepository(db);
    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const factureRepository = new FactureRepository(db);
    const stockService = new StockService(stockRepository, mouvementRepository);
    const venteService = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository);

    bootstrapDefaultEmplacements(emplacementRepository);
    registerMetierIpcHandlers(
      produitRepository,
      emplacementRepository,
      stockRepository,
      mouvementRepository,
      factureRepository,
      stockService,
      venteService
    );
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

  createMainWindow();

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
