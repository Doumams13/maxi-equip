import { dialog, app, type BrowserWindow } from "electron";
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { ImageProduitRepository } from "../repositories/imageProduitRepository.js";

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MIME_BY_EXT: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/**
 * Gestion des images produit — Correction Phase 2. Toutes les opérations
 * système (sélection de fichier, copie, lecture disque) restent dans le
 * Main process (§12 : "le Renderer ne doit pas obtenir des accès système
 * non contrôlés"). Le Renderer ne reçoit jamais de chemin de fichier —
 * uniquement des données d'image encodées (data URL), compatibles avec
 * la politique de sécurité du contenu déjà en place (img-src 'self' data:,
 * Synthèse §3) sans avoir à l'assouplir.
 */
export class ImageService {
  private readonly storageDir: string;

  constructor(
    private readonly repository: ImageProduitRepository,
    private readonly window: BrowserWindow
  ) {
    this.storageDir = join(app.getPath("userData"), "images-produits");
    if (!existsSync(this.storageDir)) mkdirSync(this.storageDir, { recursive: true });
  }

  private toDataUrl(cheminLocal: string): string | null {
    const fullPath = join(this.storageDir, cheminLocal);
    if (!existsSync(fullPath)) return null;
    const ext = extname(cheminLocal).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const base64 = readFileSync(fullPath).toString("base64");
    return `data:${mime};base64,${base64}`;
  }

  listWithDataUrls(produitId: string): { id: string; estPrincipale: boolean; ordre: number; dataUrl: string | null }[] {
    return this.repository.listByProduit(produitId).map((img) => ({
      id: img.id,
      estPrincipale: img.estPrincipale,
      ordre: img.ordre,
      dataUrl: this.toDataUrl(img.cheminLocal),
    }));
  }

  getPrincipaleDataUrl(produitId: string): string | null {
    const image = this.repository.getPrincipale(produitId);
    return image ? this.toDataUrl(image.cheminLocal) : null;
  }

  getPrincipalesDataUrlsForProduits(produitIds: string[]): Record<string, string> {
    const map = this.repository.getPrincipalesForProduits(produitIds);
    const result: Record<string, string> = {};
    for (const [produitId, image] of map.entries()) {
      const dataUrl = this.toDataUrl(image.cheminLocal);
      if (dataUrl) result[produitId] = dataUrl;
    }
    return result;
  }

  /**
   * Ouvre le sélecteur de fichiers natif (Main process uniquement) et
   * copie les fichiers choisis dans le stockage de l'application — jamais
   * référencés directement depuis leur emplacement d'origine, pour que le
   * produit reste cohérent même si le fichier source est déplacé/supprimé
   * ensuite par l'utilisateur en dehors de l'application.
   */
  async pickAndAddImages(produitId: string): Promise<{ added: number }> {
    const result = await dialog.showOpenDialog(this.window, {
      title: "Choisir une ou plusieurs images du produit",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });

    if (result.canceled || result.filePaths.length === 0) return { added: 0 };

    let added = 0;
    for (const sourcePath of result.filePaths) {
      const ext = extname(sourcePath).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) continue;
      const fileName = `${randomUUID()}${ext}`;
      copyFileSync(sourcePath, join(this.storageDir, fileName));
      this.repository.create({ produitId, cheminLocal: fileName });
      added += 1;
    }
    return { added };
  }

  setPrincipale(produitId: string, imageId: string): void {
    this.repository.setPrincipale(produitId, imageId);
  }

  remove(imageId: string): void {
    const image = this.repository.findById(imageId);
    if (!image) return;
    this.repository.remove(imageId);
    const fullPath = join(this.storageDir, image.cheminLocal);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }
}
