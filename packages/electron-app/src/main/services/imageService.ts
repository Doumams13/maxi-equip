import { dialog, app, type BrowserWindow } from "electron";
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, renameSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { ImageProduitRepository } from "../repositories/imageProduitRepository.js";

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MIME_BY_EXT: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export interface StagedImage {
  stagingId: string;
  dataUrl: string;
}

/**
 * Gestion des images modèle-produit. Images liées au modèle (motif), pas à
 * une variante spécifique. Toutes les opérations système restent dans le
 * Main process — le Renderer ne reçoit jamais de chemins de fichiers.
 */
export class ImageService {
  private readonly storageDir: string;
  private readonly stagingDir: string;

  constructor(
    private readonly repository: ImageProduitRepository,
    private readonly window: BrowserWindow
  ) {
    this.storageDir = join(app.getPath("userData"), "images-produits");
    this.stagingDir = join(this.storageDir, "_staging");
    if (!existsSync(this.storageDir)) mkdirSync(this.storageDir, { recursive: true });
    if (!existsSync(this.stagingDir)) mkdirSync(this.stagingDir, { recursive: true });
    this.clearStaging();
  }

  private clearStaging(): void {
    for (const f of readdirSync(this.stagingDir)) {
      try {
        unlinkSync(join(this.stagingDir, f));
      } catch {
        // Nettoyage best-effort.
      }
    }
  }

  private fileToDataUrl(fullPath: string): string | null {
    if (!existsSync(fullPath)) return null;
    const ext = extname(fullPath).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    try {
      const base64 = readFileSync(fullPath).toString("base64");
      return `data:${mime};base64,${base64}`;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[images] lecture impossible :", fullPath, err);
      return null;
    }
  }

  private toDataUrl(cheminLocal: string): string | null {
    return this.fileToDataUrl(join(this.storageDir, cheminLocal));
  }

  listWithDataUrls(modeleId: string): { id: string; estPrincipale: boolean; ordre: number; dataUrl: string | null }[] {
    return this.repository.listByModele(modeleId).map((img) => ({
      id: img.id,
      estPrincipale: img.estPrincipale,
      ordre: img.ordre,
      dataUrl: this.toDataUrl(img.cheminLocal),
    }));
  }

  getPrincipaleDataUrl(modeleId: string): string | null {
    const image = this.repository.getPrincipale(modeleId);
    return image ? this.toDataUrl(image.cheminLocal) : null;
  }

  getPrincipalesDataUrlsForModeles(modeleIds: string[]): Record<string, string> {
    const map = this.repository.getPrincipalesForModeles(modeleIds);
    const result: Record<string, string> = {};
    for (const [modeleId, image] of map.entries()) {
      const dataUrl = this.toDataUrl(image.cheminLocal);
      if (dataUrl) result[modeleId] = dataUrl;
    }
    return result;
  }

  countByModele(modeleId: string): number {
    return this.repository.listByModele(modeleId).length;
  }

  countForModeles(modeleIds: string[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const id of modeleIds) result[id] = this.repository.listByModele(id).length;
    return result;
  }

  private restoreWindowFocus(): void {
    if (this.window.isMinimized()) this.window.restore();
    this.window.focus();
    this.window.webContents.focus();
  }

  async pickAndAddImages(modeleId: string): Promise<{ added: number }> {
    const result = await dialog.showOpenDialog(this.window, {
      title: "Choisir une ou plusieurs images du carreau",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    this.restoreWindowFocus();

    if (result.canceled || result.filePaths.length === 0) return { added: 0 };

    let added = 0;
    for (const sourcePath of result.filePaths) {
      const ext = extname(sourcePath).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) continue;
      const fileName = `${randomUUID()}${ext}`;
      copyFileSync(sourcePath, join(this.storageDir, fileName));
      this.repository.create({ modeleId, cheminLocal: fileName });
      added += 1;
    }
    return { added };
  }

  async pickFilesToStaging(): Promise<StagedImage[]> {
    const result = await dialog.showOpenDialog(this.window, {
      title: "Choisir une ou plusieurs images du carreau",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    this.restoreWindowFocus();

    if (result.canceled || result.filePaths.length === 0) return [];

    const staged: StagedImage[] = [];
    for (const sourcePath of result.filePaths) {
      const ext = extname(sourcePath).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) continue;
      const stagingId = `${randomUUID()}${ext}`;
      const stagingPath = join(this.stagingDir, stagingId);
      copyFileSync(sourcePath, stagingPath);
      const dataUrl = this.fileToDataUrl(stagingPath);
      if (dataUrl) staged.push({ stagingId, dataUrl });
    }
    return staged;
  }

  commitStaged(modeleId: string, stagingIds: string[], principaleStagingId: string | null): void {
    for (const stagingId of stagingIds) {
      const stagingPath = join(this.stagingDir, stagingId);
      if (!existsSync(stagingPath)) continue;
      renameSync(stagingPath, join(this.storageDir, stagingId));
      const imageId = this.repository.create({ modeleId, cheminLocal: stagingId });
      if (stagingId === principaleStagingId) {
        this.repository.setPrincipale(modeleId, imageId);
      }
    }
  }

  discardStaged(stagingIds: string[]): void {
    for (const stagingId of stagingIds) {
      const stagingPath = join(this.stagingDir, stagingId);
      if (existsSync(stagingPath)) unlinkSync(stagingPath);
    }
  }

  setPrincipale(modeleId: string, imageId: string): void {
    this.repository.setPrincipale(modeleId, imageId);
  }

  remove(imageId: string): void {
    const image = this.repository.findById(imageId);
    if (!image) return;
    this.repository.remove(imageId);
    const fullPath = join(this.storageDir, image.cheminLocal);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }
}
