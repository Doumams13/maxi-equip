import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { dirname } from "node:path";
import type { BackupService } from "../services/backupService.js";

/**
 * Phase 3.8, Partie 14 : trois canaux, strictement limités aux besoins
 * réels — jamais un accès filesystem générique exposé au Renderer.
 *
 * `backup:create` : le Renderer ne choisit jamais lui-même un chemin —
 * `dialog.showOpenDialog` (mode dossier, cohérent avec le format
 * "dossier" retenu pour une sauvegarde, voir backupService.ts) est
 * exécuté ici, côté Main, exactement comme le fait déjà
 * `documents:telecharger` pour l'enregistrement d'un PDF.
 */
export function registerBackupIpcHandlers(backupService: BackupService): void {
  ipcMain.handle("backup:create", async () => {
    const fenetre = BrowserWindow.getFocusedWindow();
    const result = fenetre
      ? await dialog.showOpenDialog(fenetre, { title: "Choisir où enregistrer la sauvegarde", properties: ["openDirectory", "createDirectory"] })
      : await dialog.showOpenDialog({ title: "Choisir où enregistrer la sauvegarde", properties: ["openDirectory", "createDirectory"] });

    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };

    return backupService.creerSauvegardeManuelle(result.filePaths[0]!);
  });

  ipcMain.handle("backup:get-status", () => backupService.getStatut());

  /** Ouvre le dossier interne des sauvegardes automatiques dans l'explorateur de fichiers du système — jamais un chemin arbitraire fourni par le Renderer. */
  ipcMain.handle("backup:open-folder", async () => {
    const statut = backupService.getStatut();
    if (!statut.derniereAutomatique) return { success: false, message: "Aucune sauvegarde automatique n'existe encore." };
    const entrees = backupService.listerSauvegardesAutomatiques();
    const dossierParent = entrees[0] ? dirname(entrees[0].chemin) : null;
    if (!dossierParent) return { success: false, message: "Dossier introuvable." };
    await shell.openPath(dossierParent);
    return { success: true };
  });
}
