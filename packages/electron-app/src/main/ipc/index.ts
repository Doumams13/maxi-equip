import { app, ipcMain } from "electron";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
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

  /**
   * Correction "écran blanc fréquent, nécessite de relancer l'appli"
   * (2026-10-10) — reçoit les erreurs attrapées côté Renderer (frontière
   * React via ErrorBoundary, ou exceptions/rejets non gérés ailleurs, voir
   * renderer/main.tsx) et les écrit dans un fichier, seul moyen de
   * diagnostiquer ce qui casse réellement chez un client sans accès à ses
   * DevTools. `ipcMain.on` (fire-and-forget) et jamais bloquant : une
   * erreur d'écriture ici ne doit jamais devenir une DEUXIÈME erreur non
   * gérée qui aggraverait le problème initial.
   */
  ipcMain.on("app:reportRendererError", (_e, payload: { source: string; message: string; stack?: string }) => {
    try {
      const dir = join(app.getPath("userData"), "logs");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const ligne = `${JSON.stringify({ date: new Date().toISOString(), ...payload })}\n`;
      appendFileSync(join(dir, "erreurs-renderer.log"), ligne);
    } catch {
      // Best-effort — ne doit jamais faire planter quoi que ce soit.
    }
  });
}
