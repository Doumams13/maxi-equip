import { ipcMain } from "electron";
import { SyncService } from "../services/syncService.js";

/**
 * Phase 3.7, Partie 14 : un seul canal, `sync:run`. Le Renderer peut
 * lancer une synchronisation et recevoir son résultat — il ne gère
 * jamais le JWT, ne connaît jamais la logique PUSH/PULL, ne touche
 * jamais la boîte d'envoi directement (tout reste dans SyncService,
 * jamais dupliqué ici).
 */
export function registerSyncIpcHandlers(syncService: SyncService): void {
  ipcMain.handle("sync:run", async () => {
    return syncService.executerSynchronisation();
  });

  ipcMain.handle("sync:estEnCours", () => {
    return syncService.estEnCours();
  });
}
