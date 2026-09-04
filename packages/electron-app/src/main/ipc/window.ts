import { ipcMain, type BrowserWindow } from "electron";

/**
 * Dimensions et comportement verrouillés de l'écran de connexion
 * (demande explicite de finalisation UI) : fenêtre fixe 1366×768, non
 * redimensionnable, non maximisable, tant que l'utilisateur n'est pas
 * authentifié. Une fois connecté, la fenêtre redevient normale — cette
 * contrainte ne concerne QUE l'écran de connexion, pas les futures
 * fenêtres/écrans des phases suivantes.
 *
 * L'architecture actuelle réutilise la même fenêtre pour l'écran de
 * connexion et le tableau de bord (une seule BrowserWindow, la vue
 * affichée change côté Renderer) — ces deux canaux permettent donc de
 * verrouiller/déverrouiller dynamiquement cette même fenêtre selon l'état
 * d'authentification, sans changer l'architecture à fenêtre unique.
 */
export const LOGIN_WINDOW_SIZE = { width: 1366, height: 768 };

export function registerWindowIpcHandlers(window: BrowserWindow): void {
  ipcMain.handle("window:lockForLogin", () => {
    window.setResizable(false);
    window.setMaximizable(false);
    window.setSize(LOGIN_WINDOW_SIZE.width, LOGIN_WINDOW_SIZE.height);
    window.center();
  });

  ipcMain.handle("window:unlockForApp", () => {
    window.setResizable(true);
    window.setMaximizable(true);
  });
}
