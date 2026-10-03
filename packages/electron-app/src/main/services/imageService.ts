import { dialog, app, type BrowserWindow } from "electron";
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, renameSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { ImageProduitRepository } from "../repositories/imageProduitRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";

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
    private readonly window: BrowserWindow,
    /**
     * Correction "Intégration Site Phase 5, Partie 2 (pipeline
     * catalogue)" — optionnel pour ne jamais casser un site d'appel
     * existant (tests, scripts de maintenance) qui construirait ce
     * service sans boîte d'envoi. Sans elle, les images restent
     * gérées localement exactement comme avant, simplement jamais
     * synchronisées vers le serveur.
     */
    private readonly boiteEnvoiRepository?: BoiteEnvoiRepository
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

  /**
   * Correction "Intégration Site Phase 5, Partie 2 (pipeline
   * catalogue)" — met en attente la synchronisation d'une image vers le
   * serveur. Les octets sont lus et encodés en base64 MAINTENANT (au
   * moment de l'opération locale), jamais au moment de l'envoi réseau :
   * `SyncService` reste ainsi totalement indépendant du système de
   * fichiers, exactement comme pour les autres types (promotion, vente…)
   * dont le payload est déjà complet au moment de la mise en attente.
   */
  private enqueueImageSync(input: {
    imageId: string;
    modeleId: string;
    fileName: string | null;
    ordre: number;
    estPrincipale: boolean;
    operation: "create" | "update" | "delete";
  }): void {
    if (!this.boiteEnvoiRepository) return;
    const updatedAt = new Date().toISOString();
    if (input.operation === "delete" || !input.fileName) {
      this.boiteEnvoiRepository.creer("image_produit", input.imageId, {
        operation: input.operation,
        imageId: input.imageId,
        modeleId: input.modeleId,
        kind: "produit",
        ordre: input.ordre,
        estPrincipale: input.estPrincipale,
        updatedAt,
      });
      return;
    }
    const ext = extname(input.fileName).toLowerCase();
    const contentType = MIME_BY_EXT[ext];
    if (!contentType) return; // extension non reconnue — ne devrait jamais arriver (déjà filtré à l'ajout).
    const octets = readFileSync(join(this.storageDir, input.fileName));
    this.boiteEnvoiRepository.creer("image_produit", input.imageId, {
      operation: input.operation,
      imageId: input.imageId,
      modeleId: input.modeleId,
      kind: "produit",
      ordre: input.ordre,
      estPrincipale: input.estPrincipale,
      contentBase64: octets.toString("base64"),
      contentType,
      updatedAt,
    });
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
      const imageId = this.repository.create({ modeleId, cheminLocal: fileName });
      const cree = this.repository.findById(imageId)!;
      this.enqueueImageSync({ imageId, modeleId, fileName, ordre: cree.ordre, estPrincipale: cree.estPrincipale, operation: "create" });
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
      const estPrincipale = stagingId === principaleStagingId;
      if (estPrincipale) {
        this.repository.setPrincipale(modeleId, imageId);
      }
      const cree = this.repository.findById(imageId)!;
      // estPrincipale:true ici fait AUTOMATIQUEMENT rétrograder les
      // autres images du même modèle côté projection serveur (voir
      // catalogStore.upsertImageMeta) — jamais besoin d'enqueue séparé
      // pour les images démotées localement par setPrincipale ci-dessus.
      this.enqueueImageSync({ imageId, modeleId, fileName: stagingId, ordre: cree.ordre, estPrincipale: cree.estPrincipale, operation: "create" });
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
    const image = this.repository.findById(imageId);
    if (!image) return;
    // Métadonnées seules (jamais de nouvel octet — le fichier n'a pas
    // changé) : le serveur rétrograde lui-même les autres images du
    // modèle (voir catalogStore.upsertImageMeta).
    this.enqueueImageSync({ imageId, modeleId, fileName: null, ordre: image.ordre, estPrincipale: true, operation: "update" });
  }

  remove(imageId: string): void {
    const image = this.repository.findById(imageId);
    if (!image) return;
    this.repository.remove(imageId);
    const fullPath = join(this.storageDir, image.cheminLocal);
    if (existsSync(fullPath)) unlinkSync(fullPath);
    this.enqueueImageSync({ imageId, modeleId: image.modeleId, fileName: null, ordre: image.ordre, estPrincipale: image.estPrincipale, operation: "delete" });
  }
}
