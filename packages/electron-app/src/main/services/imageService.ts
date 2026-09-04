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
 * Gestion des images produit — Correction Phase 2. Toutes les opérations
 * système (sélection de fichier, copie, lecture disque) restent dans le
 * Main process (§12 : "le Renderer ne doit pas obtenir des accès système
 * non contrôlés"). Le Renderer ne reçoit jamais de chemin de fichier —
 * uniquement des données d'image encodées (data URL), compatibles avec
 * la politique de sécurité du contenu déjà en place (img-src 'self' data:,
 * Synthèse §3) sans avoir à l'assouplir.
 *
 * Mécanisme de "staging" (2ᵉ correction) : lorsqu'un produit n'existe pas
 * encore (formulaire de création), les images choisies sont copiées dans
 * un dossier temporaire et immédiatement renvoyées en prévisualisation
 * (data URL) — §7/§8 : la prévisualisation doit être réelle et immédiate,
 * pas un simple nom de fichier. Une fois le produit réellement créé, les
 * fichiers "stagés" sont déplacés vers le stockage définitif et associés
 * en base — jamais l'inverse (jamais de ligne en base sans fichier réel).
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
    this.clearStaging(); // les fichiers en attente d'une session précédente (fermeture sans validation) ne doivent jamais s'accumuler.
  }

  private clearStaging(): void {
    for (const f of readdirSync(this.stagingDir)) {
      try {
        unlinkSync(join(this.stagingDir, f));
      } catch {
        // Fichier déjà absent ou verrouillé — sans conséquence, ce n'est qu'un nettoyage best-effort.
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

  countByProduit(produitId: string): number {
    return this.repository.listByProduit(produitId).length;
  }

  countForProduits(produitIds: string[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const id of produitIds) result[id] = this.repository.listByProduit(id).length;
    return result;
  }

  /**
   * Ouvre le sélecteur de fichiers natif et copie les fichiers choisis
   * dans le stockage DÉFINITIF d'un produit qui existe déjà (édition
   * d'un produit existant — écran "Images" de la liste).
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

  /**
   * Ouvre le sélecteur de fichiers natif et copie les fichiers choisis en
   * zone de "staging" — utilisé par le formulaire de CRÉATION d'un
   * produit, avant que celui-ci n'existe en base. Retourne immédiatement
   * une prévisualisation réelle (data URL), pas un simple nom de fichier.
   */
  async pickFilesToStaging(): Promise<StagedImage[]> {
    const result = await dialog.showOpenDialog(this.window, {
      title: "Choisir une ou plusieurs images du produit",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });

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

  /**
   * Déplace les images "stagées" vers le stockage définitif et les
   * associe au produit désormais réellement créé. `principaleStagingId`
   * détermine laquelle devient l'image principale.
   */
  commitStaged(produitId: string, stagingIds: string[], principaleStagingId: string | null): void {
    for (const stagingId of stagingIds) {
      const stagingPath = join(this.stagingDir, stagingId);
      if (!existsSync(stagingPath)) continue;
      renameSync(stagingPath, join(this.storageDir, stagingId));
      const imageId = this.repository.create({ produitId, cheminLocal: stagingId });
      if (stagingId === principaleStagingId) {
        this.repository.setPrincipale(produitId, imageId);
      }
    }
  }

  /** Annule une sélection en cours (formulaire fermé sans validation) — supprime les fichiers stagés correspondants. */
  discardStaged(stagingIds: string[]): void {
    for (const stagingId of stagingIds) {
      const stagingPath = join(this.stagingDir, stagingId);
      if (existsSync(stagingPath)) unlinkSync(stagingPath);
    }
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
