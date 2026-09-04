import { app, ipcMain } from "electron";
import type Database from "better-sqlite3-multiple-ciphers";

/**
 * Points d'entrée IPC exposés au Renderer, via le pont contrôlé du preload
 * (jamais un accès générique — Synthèse §3). Phase 0 : uniquement de quoi
 * prouver que la chaîne complète fonctionne (Renderer → preload → IPC →
 * base de données chiffrée → retour). Les canaux métier réels (ventes,
 * stock, demandes...) seront ajoutés en Phase 2/3.
 *
 * Phase 1 (finalisation UI) : ajout de `app:quit`, nécessaire au bouton
 * "Quitter l'application" de l'écran de connexion — action purement
 * applicative (ferme le programme), sans aucun rapport avec
 * l'authentification, le domaine ou la sécurité.
 */
export function registerIpcHandlers(db: Database.Database): void {
  ipcMain.handle("app:ping", () => {
    return { ok: true, message: "Socle Phase 0 opérationnel", timestamp: new Date().toISOString() };
  });

  ipcMain.handle("app:dbHealthCheck", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[];
    return { tableCount: tables.length, tables: tables.map((t) => t.name) };
  });

  ipcMain.handle("app:quit", () => {
    app.quit();
  });
}
