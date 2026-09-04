import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { ImageProduit } from "@maxi-equip/shared-types";

interface ImageRow {
  id: string;
  produit_id: string;
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
    produitId: row.produit_id,
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

/**
 * Dépôt des images produit — Correction Phase 2. Réutilise la table
 * `images_produit` déjà prévue en Phase 0 (jamais de structure
 * concurrente créée), complétée par la colonne `est_principale`
 * (migration non destructive — voir db/migrate.ts).
 */
export class ImageProduitRepository {
  constructor(private readonly db: Database.Database) {}

  listByProduit(produitId: string): ImageProduit[] {
    const rows = this.db
      .prepare("SELECT * FROM images_produit WHERE produit_id = ? ORDER BY est_principale DESC, ordre")
      .all(produitId) as ImageRow[];
    return rows.map(rowToImage);
  }

  /** Image principale d'un produit, ou null si aucune image n'est associée. */
  getPrincipale(produitId: string): ImageProduit | null {
    const row = this.db
      .prepare("SELECT * FROM images_produit WHERE produit_id = ? AND est_principale = 1 LIMIT 1")
      .get(produitId) as ImageRow | undefined;
    return row ? rowToImage(row) : null;
  }

  /** Image principale de CHAQUE produit fourni, en une seule requête — évite les appels répétés (§22 : pas de requêtes inutiles). */
  getPrincipalesForProduits(produitIds: string[]): Map<string, ImageProduit> {
    if (produitIds.length === 0) return new Map();
    const placeholders = produitIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT * FROM images_produit WHERE produit_id IN (${placeholders}) AND est_principale = 1`)
      .all(...produitIds) as ImageRow[];
    return new Map(rows.map((r) => [r.produit_id, rowToImage(r)]));
  }

  /**
   * Associe une nouvelle image à un produit. Si c'est la toute première
   * image du produit, elle devient automatiquement l'image principale
   * (§4 : il doit toujours y avoir une image principale dès qu'il y a au
   * moins une image) — sinon elle s'ajoute simplement à la suite.
   */
  create(input: { produitId: string; cheminLocal: string }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    const existantCount = (
      this.db.prepare("SELECT COUNT(*) as n FROM images_produit WHERE produit_id = ?").get(input.produitId) as { n: number }
    ).n;
    const ordre = existantCount;
    const estPrincipale = existantCount === 0;

    this.db
      .prepare(
        `INSERT INTO images_produit (id, produit_id, kind, chemin_local, url_cloud, ordre, est_principale, sync_status, created_at, updated_at)
         VALUES (?, ?, 'produit', ?, NULL, ?, ?, 'pending', ?, ?)`
      )
      .run(id, input.produitId, input.cheminLocal, ordre, estPrincipale ? 1 : 0, now, now);
    return id;
  }

  /** Change l'image principale d'un produit — une seule à la fois (§4/§5). */
  setPrincipale(produitId: string, imageId: string): void {
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE images_produit SET est_principale = 0, updated_at = ? WHERE produit_id = ?").run(now, produitId);
      this.db.prepare("UPDATE images_produit SET est_principale = 1, updated_at = ? WHERE id = ? AND produit_id = ?").run(now, imageId, produitId);
    });
    transaction();
  }

  findById(imageId: string): ImageProduit | null {
    const row = this.db.prepare("SELECT * FROM images_produit WHERE id = ?").get(imageId) as ImageRow | undefined;
    return row ? rowToImage(row) : null;
  }

  /**
   * Retire l'association d'une image (§7 test 7). Si l'image supprimée
   * était l'image principale et qu'il en reste d'autres, la première
   * restante devient automatiquement la nouvelle image principale — pour
   * ne jamais laisser un produit avec des images mais aucune principale.
   */
  remove(imageId: string): void {
    const image = this.findById(imageId);
    if (!image) return;

    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM images_produit WHERE id = ?").run(imageId);
      if (image.estPrincipale) {
        const next = this.db
          .prepare("SELECT id FROM images_produit WHERE produit_id = ? ORDER BY ordre LIMIT 1")
          .get(image.produitId) as { id: string } | undefined;
        if (next) {
          this.db.prepare("UPDATE images_produit SET est_principale = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), next.id);
        }
      }
    });
    transaction();
  }
}
