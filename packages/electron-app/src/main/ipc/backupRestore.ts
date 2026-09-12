import { ipcMain, dialog, app, BrowserWindow } from "electron";
import type { BackupRestoreService } from "../services/backupRestoreService.js";

/**
 * Phase 3.9, Partie 1/13 : trois canaux, strictement réservés à
 * l'écran Paramètres (déjà réservé à l'Administrateur — aucun nouveau
 * système de permissions créé ici).
 *
 * `backup:restore-executer` déclenche `app.relaunch()` + `app.exit()`
 * uniquement en cas de succès réel — jamais après un échec, où
 * l'application doit continuer à fonctionner normalement.
 */
export function registerBackupRestoreIpcHandlers(restoreService: BackupRestoreService): void {
  ipcMain.handle("backup:restore-choisir-dossier", async () => {
    const fenetre = BrowserWindow.getFocusedWindow();
    const result = fenetre
      ? await dialog.showOpenDialog(fenetre, { title: "Choisir une sauvegarde MAXI-EQUIP à restaurer", properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ title: "Choisir une sauvegarde MAXI-EQUIP à restaurer", properties: ["openDirectory"] });

    if (result.canceled || result.filePaths.length === 0) return { canceled: true as const };
    return { canceled: false as const, dossier: result.filePaths[0]! };
  });

  ipcMain.handle("backup:restore-analyser", (_e, dossier: string) => restoreService.analyserSauvegarde(dossier));

  ipcMain.handle("backup:restore-executer", async (_e, dossier: string, motDePasse?: string) => {
    const resultat = await restoreService.executerRestauration(dossier, motDePasse);
    if (resultat.success) {
      app.relaunch();
      app.exit(0);
    }
    return resultat;
  });
}
