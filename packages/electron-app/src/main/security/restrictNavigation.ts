import type { BrowserWindow } from "electron";
import { shell } from "electron";

/**
 * Empêche le Renderer de naviguer vers un contenu externe ou d'ouvrir de
 * nouvelles fenêtres non contrôlées — complète l'isolation posée dans
 * windowOptions.ts (Synthèse §3).
 */
export function restrictNavigation(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !url.startsWith("http://localhost")) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    // Tout lien externe s'ouvre dans le navigateur système, jamais dans une
    // fenêtre Electron supplémentaire non sécurisée.
    void shell.openExternal(url);
    return { action: "deny" };
  });
}
