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

// Le processus principal est construit en CommonJS (voir electron.vite.config.ts)
// — __dirname est donc nativement disponible, pas besoin de la variante ESM
// (import.meta.url) qui compliquerait inutilement la sortie CJS attendue par
// Electron pour un preload/main compatibles avec le mode "sandbox: true".

// En développement, electron-vite fournit l'URL du serveur Vite ; en
// production, le renderer est chargé depuis les fichiers empaquetés.
const RENDERER_DEV_SERVER_URL = process.env["ELECTRON_RENDERER_URL"];

function createMainWindow(): BrowserWindow {
  const preloadDir = join(__dirname, "../preload");

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
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
