import { ipcMain, dialog, app, BrowserWindow } from "electron";
import type { BackupRestoreService } from "../services/backupRestoreService.js";
import type { SessionManager } from "../auth/sessionManager.js";
import { checkAdminGuard } from "../auth/checkAdminGuard.js";

/**
 * Phase 3.9, Partie 1/13 : trois canaux, strictement réservés à
 * l'écran Paramètres (déjà réservé à l'Administrateur).
 *
 * CORRECTION SÉCURITÉ (audit "check up complet") : contrairement à ce
 * que le commentaire d'origine affirmait ("aucun nouveau système de
 * permissions créé ici"), AUCUNE vérification de rôle n'existait
 * réellement côté Main — seul l'écran Paramètres masquait ce bouton
 * côté Renderer. La restauration écrase intégralement la base live
 * (après une sauvegarde de sécurité, mais reste une opération à hauts
 * risques) : un Gérant pouvait la déclencher directement via
 * `window.maxiEquip.backupRestoreExecuter(...)` (DevTools, F12 déjà
 * activé), y compris avec une sauvegarde de son choix. Corrigé avec le
 * même garde-fou déjà utilisé et testé dans `ipc/utilisateurs.ts`.
 *
 * `backup:restore-executer` déclenche `app.relaunch()` + `app.exit()`
 * uniquement en cas de succès réel — jamais après un échec, où
 * l'application doit continuer à fonctionner normalement.
 */
export function registerBackupRestoreIpcHandlers(restoreService: BackupRestoreService, sessionManager: SessionManager): void {
  const checkAdmin = () => checkAdminGuard(sessionManager);

  ipcMain.handle("backup:restore-choisir-dossier", async () => {
    const guard = checkAdmin();
    if (!guard.ok) return { canceled: true as const };

    const fenetre = BrowserWindow.getFocusedWindow();
    const result = fenetre
      ? await dialog.showOpenDialog(fenetre, { title: "Choisir une sauvegarde MAXI-EQUIP à restaurer", properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ title: "Choisir une sauvegarde MAXI-EQUIP à restaurer", properties: ["openDirectory"] });

    if (result.canceled || result.filePaths.length === 0) return { canceled: true as const };
    return { canceled: false as const, dossier: result.filePaths[0]! };
  });

  ipcMain.handle("backup:restore-analyser", (_e, dossier: string) => {
    const guard = checkAdmin();
    if (!guard.ok) return { compatible: "incompatible" as const, message: guard.message, necessiteMotDePasse: false, vulnerable: false };
    return restoreService.analyserSauvegarde(dossier);
  });

  ipcMain.handle("backup:restore-executer", async (_e, dossier: string, motDePasse?: string) => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message, etape: "mot_de_passe" as const };

    const resultat = await restoreService.executerRestauration(dossier, motDePasse);
    if (resultat.success) {
      app.relaunch();
      app.exit(0);
    }
    return resultat;
  });
}
