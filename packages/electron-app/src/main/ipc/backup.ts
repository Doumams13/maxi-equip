import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { dirname } from "node:path";
import type { BackupService } from "../services/backupService.js";
import { validerMotDePasse } from "../services/backupCrypto.js";

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
 */
export function registerBackupIpcHandlers(backupService: BackupService): void {
  ipcMain.handle("backup:choisir-dossier", async () => {
    const fenetre = BrowserWindow.getFocusedWindow();
    const result = fenetre
      ? await dialog.showOpenDialog(fenetre, { title: "Choisir où enregistrer la sauvegarde", properties: ["openDirectory", "createDirectory"] })
      : await dialog.showOpenDialog({ title: "Choisir où enregistrer la sauvegarde", properties: ["openDirectory", "createDirectory"] });

    if (result.canceled || result.filePaths.length === 0) return { canceled: true as const };
    return { canceled: false as const, dossier: result.filePaths[0]! };
  });

  ipcMain.handle("backup:creer-manuelle", (_e, dossier: string, motDePasse: string, confirmation: string) => {
    // Revalidation complète côté Main (Partie 6) — jamais une confiance aveugle dans la validation déjà faite côté Renderer.
    const validation = validerMotDePasse(motDePasse, confirmation);
    if (!validation.valide) return { success: false, message: validation.message };

    return backupService.creerSauvegardeManuelle(dossier, motDePasse);
  });

  ipcMain.handle("backup:get-status", () => backupService.getStatut());

  /** Ouvre le dossier interne des sauvegardes automatiques dans l'explorateur de fichiers — jamais un chemin arbitraire fourni par le Renderer. */
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
