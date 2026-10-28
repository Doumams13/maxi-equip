import { ipcMain } from "electron";
import { SyncService, type ResultatSynchronisation } from "../services/syncService.js";
import { getConfigurationSync } from "../services/syncConfig.js";
import type { SessionManager } from "../auth/sessionManager.js";
import type { BackupService } from "../services/backupService.js";
import { declencherSauvegardeAutoEtCloudSiNecessaire } from "../services/cloudBackupTrigger.js";

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
/**
 * Logique réelle de "sync:run", extraite en fonction pure (jamais
 * `ipcMain` dans ce fichier — convention de ce projet, voir
 * initialisationStockCentral.ts) pour rester testable sans runtime
 * Electron. Système multiposte fiable (2026-10-28) : un poste bloqué
 * doit voir sa session locale fermée IMMÉDIATEMENT à la réception du
 * refus serveur, jamais seulement au prochain cycle automatique (voir
 * main/index.ts pour ce second cas, la synchronisation périodique).
 */
export async function executerSyncRun(
  syncService: Pick<SyncService, "executerSynchronisation">,
  sessionManager: Pick<SessionManager, "isAuthenticated" | "clear">,
  /**
   * Système multiposte fiable (2026-10-28) — OPTIONNEL (jamais un site
   * d'appel/test existant cassé) : quand fourni, un clic manuel sur
   * "Synchroniser" peut lui aussi déclencher une sauvegarde automatique
   * cloud si nécessaire (voir cloudBackupTrigger.ts — no-op la quasi-
   * totalité du temps, limité à 24h par BackupService), exactement
   * comme le cycle automatique de main/index.ts. Jamais attendu
   * (fire-and-forget) : n'allonge jamais la réponse perçue du clic.
   */
  backupService?: Pick<BackupService, "creerSauvegardeAutomatiqueSiNecessaire">
): Promise<ResultatSynchronisation> {
  if (!sessionManager.isAuthenticated()) {
    return { success: false, etape: "push" as const, message: "Non authentifié." };
  }
  const resultat = await syncService.executerSynchronisation();
  if (resultat.posteBloque) {
    sessionManager.clear();
  }
  if (resultat.success && backupService) declencherSauvegardeAutoEtCloudSiNecessaire(backupService);
  return resultat;
}

export function registerSyncIpcHandlers(syncService: SyncService, sessionManager: SessionManager, backupService?: BackupService): void {
  ipcMain.handle("sync:run", () => executerSyncRun(syncService, sessionManager, backupService));

  ipcMain.handle("sync:estEnCours", () => {
    return syncService.estEnCours();
  });

  ipcMain.handle("sync:configuree", () => {
    return getConfigurationSync().jwt !== null;
  });
}
