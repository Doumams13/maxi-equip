import { ipcMain } from "electron";
import { ImageService } from "../services/imageService.js";

export function registerImageIpcHandlers(imageService: ImageService): void {
  ipcMain.handle("images:list", (_e, produitId: string) => imageService.listWithDataUrls(produitId));

  ipcMain.handle("images:pickAndAdd", async (_e, produitId: string) => {
    try {
      const result = await imageService.pickAndAddImages(produitId);
      return { success: true, added: result.added };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[images] ajout impossible :", err);
      return { success: false, message: "Une erreur inattendue s'est produite lors de l'ajout des images." };
    }
  });

  ipcMain.handle("images:setPrincipale", (_e, produitId: string, imageId: string) => {
    imageService.setPrincipale(produitId, imageId);
    return { success: true };
  });

  ipcMain.handle("images:remove", (_e, imageId: string) => {
    imageService.remove(imageId);
    return { success: true };
  });
}
