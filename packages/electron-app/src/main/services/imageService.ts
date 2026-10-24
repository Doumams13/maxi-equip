import { dialog, app, type BrowserWindow } from "electron";
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { Jimp } from "jimp";
import { ImageProduitRepository } from "../repositories/imageProduitRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MIME_BY_EXT: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/**
 * Délais réseau pour `synchroniserImagesManquantes` — mêmes valeurs que
 * `syncService.ts` pour la cohérence (liste JSON légère vs. téléchargement
 * d'un fichier réel).
 */
const DELAI_MAX_REQUETE_LISTE_IMAGES_MS = 20_000;
const DELAI_MAX_REQUETE_TELECHARGEMENT_IMAGE_MS = 45_000;

interface ImageServeur {
  id: string;
  modeleId: string;
  ordre: number;
  estPrincipale: boolean;
  url: string | null;
}

/**
 * Correction "photos lentes à charger sur le site" (2026-10-10) : les
 * photos ajoutées depuis un téléphone/appareil photo font souvent
 * plusieurs Mo alors qu'elles ne sont jamais affichées aussi grand sur le
 * site (voir next/image côté packages/site, qui redimensionne déjà à
 * l'affichage mais doit télécharger/décoder l'original en entier pour
 * chaque variante). Réduit le poids à la source, une seule fois, plutôt
 * que de payer ce coût à chaque visite du site.
 *
 * 1600px de long côté = largement au-dessus de ce qu'un produit affiche
 * jamais sur le site, même plein écran. Qualité 80 = niveau standard
 * e-commerce, perte visuelle non perceptible.
 */
const DIMENSION_MAX_IMAGE = 1600;
const QUALITE_JPEG = 80;

/**
 * Redimensionne/compresse une image JPEG ou PNG vers `destPath`. Ne
 * touche jamais aux dimensions d'une image déjà plus petite que
 * `DIMENSION_MAX_IMAGE` (jamais d'agrandissement). Retourne `false` pour
 * un format non pris en charge par Jimp tel que configuré ici (ex.
 * `.webp` — pas de plugin installé) : l'appelant copie alors le fichier
 * tel quel, comme avant cette correction.
 */
async function comprimerImage(sourcePath: string, destPath: string, ext: string): Promise<boolean> {
  if (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png") return false;
  const image = await Jimp.read(sourcePath);
  const coteLong = Math.max(image.bitmap.width, image.bitmap.height);
  if (coteLong > DIMENSION_MAX_IMAGE) {
    image.scale(DIMENSION_MAX_IMAGE / coteLong);
  }
  const buffer =
    ext === ".png" ? await image.getBuffer("image/png") : await image.getBuffer("image/jpeg", { quality: QUALITE_JPEG });
  writeFileSync(destPath, buffer);
  return true;
}

/**
 * Copie une image source vers `destPath` en tentant d'abord la
 * compression — jamais un échec bloquant pour l'utilisateur : un fichier
 * corrompu ou un format non pris en charge retombe sur une copie brute
 * (comportement identique à avant cette correction).
 */
async function copierImageComprimee(sourcePath: string, destPath: string): Promise<void> {
  const ext = extname(sourcePath).toLowerCase();
  try {
    const compresse = await comprimerImage(sourcePath, destPath, ext);
    if (compresse) return;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[images] compression impossible, copie brute à la place :", sourcePath, err);
  }
  copyFileSync(sourcePath, destPath);
}

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
      await copierImageComprimee(sourcePath, join(this.storageDir, fileName));
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
      await copierImageComprimee(sourcePath, stagingPath);
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

  /** Extension déduite du paramètre `?file=...ext` de l'URL publique serveur — `.jpg` par défaut si absent/illisible (jamais bloquant). */
  private extensionDepuisUrl(url: string): string {
    try {
      const fichier = new URL(url).searchParams.get("file");
      if (fichier) {
        const ext = extname(fichier).toLowerCase();
        if (ACCEPTED_EXTENSIONS.includes(ext)) return ext;
      }
    } catch {
      // URL illisible — repli ci-dessous.
    }
    return ".jpg";
  }

  /**
   * Correction "photos de carreaux absentes sur poste restauré/secondaire"
   * (2026-10-24) — jusqu'ici les photos ne circulaient QUE dans le sens
   * poste → serveur (voir `enqueueImageSync`) : une sauvegarde cloud ne
   * contient que `database.sqlite`, jamais les fichiers de
   * `images-produits/`, et un deuxième poste synchronisé ne les recevait
   * jamais non plus (le type `image_produit` est explicitement exclu du
   * journal générique dans `syncService.ts`).
   *
   * Appelée à chaque cycle de synchronisation automatique (voir
   * `SyncService.executerSynchronisation`) : interroge
   * `GET /v1/app/images/list` (TOUTES les images connues du serveur, pas
   * seulement celles de produits actifs), puis télécharge uniquement les
   * fichiers absents localement — jamais un fichier déjà présent, jamais
   * bloquant pour le reste de la synchronisation (chaque image est
   * indépendante, une erreur réseau sur l'une n'empêche jamais les autres).
   *
   * Pour une ligne `images_produit` déjà connue localement (restauration :
   * la ligne existe, seul le FICHIER manque), réutilise son `cheminLocal`
   * existant — jamais un nouveau nom, qui romprait la correspondance déjà
   * en base. Pour une image totalement inconnue ici (vrai deuxième poste),
   * construit un nom déterministe `<imageId><extension>` : si le modèle
   * référencé n'a pas encore été reçu localement par PULL, l'insertion de
   * la ligne échoue proprement (voir `creerDepuisServeur`) mais le fichier
   * reste écrit sous ce même nom déterministe — le prochain cycle le
   * retrouvera sans retélécharger et pourra alors créer la ligne.
   */
  async synchroniserImagesManquantes(apiUrl: string, jwt: string): Promise<{ telechargees: number }> {
    let reponse: Response;
    try {
      reponse = await fetch(`${apiUrl}/v1/app/images/list`, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(DELAI_MAX_REQUETE_LISTE_IMAGES_MS),
      });
    } catch {
      return { telechargees: 0 };
    }
    if (!reponse.ok) return { telechargees: 0 };

    let corps: { images: ImageServeur[] };
    try {
      corps = (await reponse.json()) as { images: ImageServeur[] };
      if (!Array.isArray(corps.images)) return { telechargees: 0 };
    } catch {
      return { telechargees: 0 };
    }

    let telechargees = 0;
    for (const img of corps.images) {
      if (!img.url) continue;

      const existante = this.repository.findById(img.id);
      const cheminLocal = existante ? existante.cheminLocal : `${img.id}${this.extensionDepuisUrl(img.url)}`;
      const cheminComplet = join(this.storageDir, cheminLocal);

      if (existsSync(cheminComplet)) {
        // Fichier déjà présent — seule la ligne locale peut encore manquer
        // (modèle reçu depuis le cycle précédent) : tentative sans
        // retéléchargement réseau.
        if (!existante) {
          this.repository.creerDepuisServeur({ id: img.id, modeleId: img.modeleId, cheminLocal, urlCloud: img.url, ordre: img.ordre, estPrincipale: img.estPrincipale });
        }
        continue;
      }

      let octets: Buffer;
      try {
        const repImage = await fetch(img.url, { signal: AbortSignal.timeout(DELAI_MAX_REQUETE_TELECHARGEMENT_IMAGE_MS) });
        if (!repImage.ok) continue;
        octets = Buffer.from(await repImage.arrayBuffer());
      } catch {
        continue;
      }

      try {
        writeFileSync(cheminComplet, octets);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[images] écriture impossible lors du rattrapage :", cheminComplet, err);
        continue;
      }

      if (!existante) {
        this.repository.creerDepuisServeur({ id: img.id, modeleId: img.modeleId, cheminLocal, urlCloud: img.url, ordre: img.ordre, estPrincipale: img.estPrincipale });
      }
      telechargees += 1;
    }
    return { telechargees };
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
