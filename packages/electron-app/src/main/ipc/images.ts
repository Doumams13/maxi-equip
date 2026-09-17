import { ipcMain } from "electron";
import { ImageService } from "../services/imageService.js";

export function registerImageIpcHandlers(imageService: ImageService): void {
  ipcMain.handle("images:list", (_e, modeleId: string) => imageService.listWithDataUrls(modeleId));

  ipcMain.handle("images:pickAndAdd", async (_e, modeleId: string) => {
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
    imageService.setPrincipale(modeleId, imageId);
    return { success: true };
  });

  ipcMain.handle("images:remove", (_e, imageId: string) => {
    imageService.remove(imageId);
    return { success: true };
  });

  ipcMain.handle("images:pickFilesToStaging", async () => {
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
    imageService.commitStaged(modeleId, stagingIds, principaleStagingId);
    return { success: true };
  });

  ipcMain.handle("images:discardStaged", (_e, stagingIds: string[]) => {
    imageService.discardStaged(stagingIds);
    return { success: true };
  });
}
