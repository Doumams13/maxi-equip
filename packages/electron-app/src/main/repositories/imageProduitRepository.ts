import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { ImageProduit } from "@maxi-equip/shared-types";

interface ImageRow {
  id: string;
  modele_id: string;
  kind: string;
  chemin_local: string;
  url_cloud: string | null;
  ordre: number;
  est_principale: number;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

function rowToImage(row: ImageRow): ImageProduit {
  return {
    id: row.id,
    modeleId: row.modele_id,
    kind: row.kind as ImageProduit["kind"],
    cheminLocal: row.chemin_local,
    urlCloud: row.url_cloud,
    ordre: row.ordre,
    estPrincipale: row.est_principale === 1,
    syncStatus: row.sync_status as ImageProduit["syncStatus"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ImageProduitRepository {
  constructor(private readonly db: Database.Database) {}

  listByModele(modeleId: string): ImageProduit[] {
    const rows = this.db
      .prepare("SELECT * FROM images_produit WHERE modele_id = ? ORDER BY est_principale DESC, ordre")
      .all(modeleId) as ImageRow[];
    return rows.map(rowToImage);
  }

  /** Image principale d'un modèle, ou null si aucune image n'est associée. */
  getPrincipale(modeleId: string): ImageProduit | null {
    const row = this.db
      .prepare("SELECT * FROM images_produit WHERE modele_id = ? AND est_principale = 1 LIMIT 1")
      .get(modeleId) as ImageRow | undefined;
    return row ? rowToImage(row) : null;
  }

  /** Image principale de CHAQUE modèle fourni, en une seule requête. */
  getPrincipalesForModeles(modeleIds: string[]): Map<string, ImageProduit> {
    if (modeleIds.length === 0) return new Map();
    const placeholders = modeleIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT * FROM images_produit WHERE modele_id IN (${placeholders}) AND est_principale = 1`)
      .all(...modeleIds) as ImageRow[];
    return new Map(rows.map((r) => [r.modele_id, rowToImage(r)]));
  }

  /**
   * Associe une nouvelle image à un modèle. Si c'est la toute première
   * image, elle devient automatiquement l'image principale.
   */
  create(input: { modeleId: string; cheminLocal: string }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    const existantCount = (
      this.db.prepare("SELECT COUNT(*) as n FROM images_produit WHERE modele_id = ?").get(input.modeleId) as { n: number }
    ).n;
    const ordre = existantCount;
    const estPrincipale = existantCount === 0;

    this.db
      .prepare(
        `INSERT INTO images_produit (id, modele_id, kind, chemin_local, url_cloud, ordre, est_principale, sync_status, created_at, updated_at)
         VALUES (?, ?, 'produit', ?, NULL, ?, ?, 'pending', ?, ?)`
      )
      .run(id, input.modeleId, input.cheminLocal, ordre, estPrincipale ? 1 : 0, now, now);
    return id;
  }

  /** Change l'image principale d'un modèle — une seule à la fois. */
  setPrincipale(modeleId: string, imageId: string): void {
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE images_produit SET est_principale = 0, updated_at = ? WHERE modele_id = ?").run(now, modeleId);
      this.db.prepare("UPDATE images_produit SET est_principale = 1, updated_at = ? WHERE id = ? AND modele_id = ?").run(now, imageId, modeleId);
    });
    transaction();
  }

  /**
   * Correction "photos de carreaux absentes sur poste restauré/secondaire"
   * (2026-10-24) — insère une ligne reçue du serveur (voir
   * `ImageService.synchroniserImagesManquantes`), en conservant l'`id`
   * EXACT de l'image d'origine (jamais un nouvel UUID local, qui casserait
   * la correspondance avec ce même serveur lors d'un futur rattrapage).
   *
   * Renvoie `false` sans rien modifier si l'insertion échoue (typiquement :
   * le modèle référencé n'a pas encore été reçu localement par PULL —
   * contrainte FK sur `modele_id`) — jamais bloquant, une nouvelle
   * tentative aura lieu au prochain cycle de synchronisation automatique.
   */
  creerDepuisServeur(input: { id: string; modeleId: string; cheminLocal: string; urlCloud: string | null; ordre: number; estPrincipale: boolean }): boolean {
    const now = new Date().toISOString();
    try {
      const transaction = this.db.transaction(() => {
        if (input.estPrincipale) {
          this.db.prepare("UPDATE images_produit SET est_principale = 0, updated_at = ? WHERE modele_id = ?").run(now, input.modeleId);
        }
        this.db
          .prepare(
            `INSERT INTO images_produit (id, modele_id, kind, chemin_local, url_cloud, ordre, est_principale, sync_status, created_at, updated_at)
             VALUES (?, ?, 'produit', ?, ?, ?, ?, 'confirmed', ?, ?)`
          )
          .run(input.id, input.modeleId, input.cheminLocal, input.urlCloud, input.ordre, input.estPrincipale ? 1 : 0, now, now);
      });
      transaction();
      return true;
    } catch {
      return false;
    }
  }

  findById(imageId: string): ImageProduit | null {
    const row = this.db.prepare("SELECT * FROM images_produit WHERE id = ?").get(imageId) as ImageRow | undefined;
    return row ? rowToImage(row) : null;
  }

  /**
   * Retire une image. Si l'image supprimée était l'image principale et
   * qu'il en reste d'autres, la première restante devient la nouvelle principale.
   */
  remove(imageId: string): void {
    const image = this.findById(imageId);
    if (!image) return;

    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM images_produit WHERE id = ?").run(imageId);
      if (image.estPrincipale) {
        const next = this.db
          .prepare("SELECT id FROM images_produit WHERE modele_id = ? ORDER BY ordre LIMIT 1")
          .get(image.modeleId) as { id: string } | undefined;
        if (next) {
          this.db.prepare("UPDATE images_produit SET est_principale = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), next.id);
        }
      }
    });
    transaction();
  }
}
