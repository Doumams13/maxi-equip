import { ipcMain } from "electron";
import { SyncService } from "../services/syncService.js";
import { getConfigurationSync } from "../services/syncConfig.js";
import type { SessionManager } from "../auth/sessionManager.js";

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
 *
 * CORRECTION SÉCURITÉ (audit "check up complet") : aucun canal ne
 * vérifiait la moindre session — `sync:run` pouvait être déclenché
 * avant toute connexion (DevTools). Impact limité (aucune donnée
 * sensible renvoyée, PUSH/PULL déjà protégés en amont par le JWT
 * d'installation), mais corrigé par cohérence avec le reste de l'audit.
 */
export function registerSyncIpcHandlers(syncService: SyncService, sessionManager: SessionManager): void {
  ipcMain.handle("sync:run", async () => {
    if (!sessionManager.isAuthenticated()) {
      return { success: false, etape: "push" as const, message: "Non authentifié." };
    }
    return syncService.executerSynchronisation();
  });

  ipcMain.handle("sync:estEnCours", () => {
    return syncService.estEnCours();
  });

  ipcMain.handle("sync:configuree", () => {
    return getConfigurationSync().jwt !== null;
  });
}
