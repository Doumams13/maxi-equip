import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { dirname } from "node:path";
import type { BackupService } from "../services/backupService.js";
import { validerMotDePasse } from "../services/backupCrypto.js";
import type { SessionManager } from "../auth/sessionManager.js";
import { checkAdminGuard } from "../auth/checkAdminGuard.js";

/**
 * Correction "Sécurité et clarté des sauvegardes" — trois canaux
 * strictement limités aux besoins réels, jamais un accès filesystem
 * générique exposé au Renderer.
 *
 * `backup:choisir-dossier` et `backup:creer-manuelle` sont désormais
 * SÉPARÉS (Partie 2/5) : le Renderer affiche d'abord le sélecteur de
 * dossier natif, PUIS son propre formulaire de mot de passe (avec
 * confirmation) — une boîte de dialogue système ne peut pas demander
 * une confirmation de mot de passe de façon satisfaisante. Le mot de
 * passe transite par IPC uniquement pour l'opération demandée (Partie
 * 7) — jamais conservé, jamais renvoyé au Renderer, jamais journalisé.
 *
 * CORRECTION SÉCURITÉ (audit "check up complet") : l'écran Paramètres
 * qui héberge ces boutons est déjà réservé à l'Administrateur
 * (`canEditCompanySettings`), mais ce filtrage n'existait QUE côté
 * Renderer — les canaux IPC eux-mêmes ne vérifiaient aucune session ni
 * rôle. N'importe quel utilisateur connecté (y compris un Gérant, via
 * les DevTools volontairement activés — F12) pouvait donc exporter
 * l'intégralité de la base (avec un mot de passe de son choix) en
 * appelant directement `window.maxiEquip.backupCreerManuelle(...)`.
 * Corrigé en reprenant EXACTEMENT le même garde-fou déjà utilisé et
 * testé ailleurs (voir `ipc/utilisateurs.ts`) — jamais une seconde
 * logique de vérification de rôle inventée pour l'occasion.
 */
export function registerBackupIpcHandlers(backupService: BackupService, sessionManager: SessionManager): void {
  const checkAdmin = () => checkAdminGuard(sessionManager);

  ipcMain.handle("backup:choisir-dossier", async () => {
    const guard = checkAdmin();
    if (!guard.ok) return { canceled: true as const };

    const fenetre = BrowserWindow.getFocusedWindow();
    const result = fenetre
      ? await dialog.showOpenDialog(fenetre, { title: "Choisir où enregistrer la sauvegarde", properties: ["openDirectory", "createDirectory"] })
      : await dialog.showOpenDialog({ title: "Choisir où enregistrer la sauvegarde", properties: ["openDirectory", "createDirectory"] });

    if (result.canceled || result.filePaths.length === 0) return { canceled: true as const };
    return { canceled: false as const, dossier: result.filePaths[0]! };
  });

  ipcMain.handle("backup:creer-manuelle", (_e, dossier: string, motDePasse: string, confirmation: string) => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };

    // Revalidation complète côté Main (Partie 6) — jamais une confiance aveugle dans la validation déjà faite côté Renderer.
    const validation = validerMotDePasse(motDePasse, confirmation);
    if (!validation.valide) return { success: false, message: validation.message };

    return backupService.creerSauvegardeManuelle(dossier, motDePasse);
  });

  ipcMain.handle("backup:get-status", () => {
    const guard = checkAdmin();
    if (!guard.ok) return { derniereAutomatique: null, nombreVulnerables: 0 };
    return backupService.getStatut();
  });

  /** Ouvre le dossier interne des sauvegardes automatiques dans l'explorateur de fichiers — jamais un chemin arbitraire fourni par le Renderer. */
  ipcMain.handle("backup:open-folder", async () => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };

    const statut = backupService.getStatut();
    if (!statut.derniereAutomatique) return { success: false, message: "Aucune sauvegarde automatique n'existe encore." };
    const entrees = backupService.listerSauvegardesAutomatiques();
    const dossierParent = entrees[0] ? dirname(entrees[0].chemin) : null;
    if (!dossierParent) return { success: false, message: "Dossier introuvable." };
    await shell.openPath(dossierParent);
    return { success: true };
  });
}
