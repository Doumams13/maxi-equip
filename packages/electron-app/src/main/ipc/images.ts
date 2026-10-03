import { ipcMain } from "electron";
import { ImageService } from "../services/imageService.js";
import type { SessionManager } from "../auth/sessionManager.js";

/**
 * CORRECTION SÉCURITÉ (audit "check up complet") : aucun de ces canaux
 * ne vérifiait la moindre session — atteignables via DevTools avant
 * même une connexion. Administrateur ET Gérant peuvent tous deux gérer
 * les images (même politique que le reste du catalogue, voir
 * ipc/metier.ts), donc pas de restriction de rôle ici — seulement la
 * garantie qu'un utilisateur soit réellement authentifié.
 */
export function registerImageIpcHandlers(imageService: ImageService, sessionManager: SessionManager): void {
  ipcMain.handle("images:list", (_e, modeleId: string) => {
    if (!sessionManager.isAuthenticated()) return [];
    return imageService.listWithDataUrls(modeleId);
  });

  ipcMain.handle("images:pickAndAdd", async (_e, modeleId: string) => {
    if (!sessionManager.isAuthenticated()) return { success: false, message: "Non authentifié." };
    try {
      const result = await imageService.pickAndAddImages(modeleId);
      return { success: true, added: result.added };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[images] ajout impossible :", err);
      return { success: false, message: "Une erreur inattendue s'est produite lors de l'ajout des images." };
    }
  });

  ipcMain.handle("images:setPrincipale", (_e, modeleId: string, imageId: string) => {
    if (!sessionManager.isAuthenticated()) return { success: false, message: "Non authentifié." };
    imageService.setPrincipale(modeleId, imageId);
    return { success: true };
  });

  ipcMain.handle("images:remove", (_e, imageId: string) => {
    if (!sessionManager.isAuthenticated()) return { success: false, message: "Non authentifié." };
    imageService.remove(imageId);
    return { success: true };
  });

  ipcMain.handle("images:pickFilesToStaging", async () => {
    if (!sessionManager.isAuthenticated()) return { success: false, message: "Non authentifié." };
    try {
      const staged = await imageService.pickFilesToStaging();
      return { success: true, staged };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[images] sélection impossible :", err);
      return { success: false, message: "Une erreur inattendue s'est produite lors de la sélection des images." };
    }
  });

  ipcMain.handle("images:commitStaged", (_e, modeleId: string, stagingIds: string[], principaleStagingId: string | null) => {
    if (!sessionManager.isAuthenticated()) return { success: false, message: "Non authentifié." };
    imageService.commitStaged(modeleId, stagingIds, principaleStagingId);
    return { success: true };
  });

  ipcMain.handle("images:discardStaged", (_e, stagingIds: string[]) => {
    if (!sessionManager.isAuthenticated()) return { success: false, message: "Non authentifié." };
    imageService.discardStaged(stagingIds);
    return { success: true };
  });
}
