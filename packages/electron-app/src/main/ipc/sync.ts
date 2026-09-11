import { ipcMain } from "electron";
import { SyncService } from "../services/syncService.js";
import { getConfigurationSync } from "../services/syncConfig.js";

/**
 * Phase 3.7, Partie 14 : `sync:run` et `sync:estEnCours` — inchangés
 * depuis la Phase 3.7 (correction "Affichage de la synchronisation" :
 * cette étape ne touche ni SyncService, ni la logique PUSH/PULL, ni la
 * boîte d'envoi — uniquement l'affichage).
 *
 * `sync:configuree` est un AJOUT, jamais une modification de l'existant
 * — une simple lecture, sans effet de bord, permettant à l'indicateur
 * du Header de savoir immédiatement (sans lancer de synchronisation)
 * s'il doit afficher l'état "non configurée". Ne renvoie qu'un booléen —
 * jamais l'URL ni le jeton lui-même, qui ne quittent jamais le
 * processus principal.
 */
export function registerSyncIpcHandlers(syncService: SyncService): void {
  ipcMain.handle("sync:run", async () => {
    return syncService.executerSynchronisation();
  });

  ipcMain.handle("sync:estEnCours", () => {
    return syncService.estEnCours();
  });

  ipcMain.handle("sync:configuree", () => {
    return getConfigurationSync().jwt !== null;
  });
}
