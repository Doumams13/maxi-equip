import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Produit } from "@maxi-equip/shared-types";

interface ProduitRow {
  id: string;
  motif: string;
  type: string;
  taille: string;
  taille_tri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  prix: number;
  seuil_alerte: number;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProduit(row: ProduitRow): Produit {
  return {
    id: row.id,
    motif: row.motif,
    type: row.type,
    taille: row.taille,
    tailleTri: row.taille_tri,
    largeur: row.largeur,
    hauteur: row.hauteur,
    reference: row.reference,
    prix: row.prix,
    seuilAlerte: row.seuil_alerte,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProduitRepository {
  constructor(private readonly db: Database.Database) {}

  /** Catalogue actif, trié par taille puis motif — cahier des charges §4. */
  list(): Produit[] {
    const rows = this.db
      .prepare("SELECT * FROM produits WHERE deleted_at IS NULL ORDER BY taille_tri, motif")
      .all() as ProduitRow[];
    return rows.map(rowToProduit);
  }

  findById(id: string): Produit | null {
    const row = this.db.prepare("SELECT * FROM produits WHERE id = ?").get(id) as ProduitRow | undefined;
    return row ? rowToProduit(row) : null;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) as n FROM produits WHERE deleted_at IS NULL").get() as { n: number }).n;
  }

  countBelowThreshold(): number {
    // Compte les produits dont AU MOINS un emplacement est sous son seuil d'alerte.
    return (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT p.id) as n FROM produits p
           JOIN stocks s ON s.produit_id = p.id
           WHERE p.deleted_at IS NULL AND s.quantite <= p.seuil_alerte AND p.seuil_alerte > 0`
        )
        .get() as { n: number }
    ).n;
  }

  /** Valeurs déjà utilisées pour "type" — autocomplétion, jamais une liste fermée (cahier des charges §4). */
  distinctTypes(): string[] {
    return (this.db.prepare("SELECT DISTINCT type FROM produits WHERE deleted_at IS NULL ORDER BY type").all() as { type: string }[]).map(
      (r) => r.type
    );
  }

  /** Idem pour "taille". */
  distinctTailles(): string[] {
    return (
      this.db
        .prepare("SELECT DISTINCT taille FROM produits WHERE deleted_at IS NULL ORDER BY taille_tri")
        .all() as { taille: string }[]
    ).map((r) => r.taille);
  }

  create(input: {
    motif: string;
    type: string;
    taille: string;
    tailleTri: number;
    largeur?: number | null;
    hauteur?: number | null;
    reference: string;
    prix: number;
    seuilAlerte: number;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO produits (id, motif, type, taille, taille_tri, largeur, hauteur, reference, prix, seuil_alerte, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.motif,
        input.type,
        input.taille,
        input.tailleTri,
        input.largeur ?? null,
        input.hauteur ?? null,
        input.reference,
        input.prix,
        input.seuilAlerte,
        now,
        now
      );
    return id;
  }

  /** Modifie un produit existant. Ne touche jamais aux images (gérées séparément — ImageService). */
  update(
    id: string,
    input: {
      type: string;
      taille: string;
      tailleTri: number;
      largeur?: number | null;
      hauteur?: number | null;
      reference: string;
      prix: number;
      seuilAlerte: number;
    }
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE produits
         SET type = ?, taille = ?, taille_tri = ?, largeur = ?, hauteur = ?, reference = ?, prix = ?, seuil_alerte = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(
        input.type,
        input.taille,
        input.tailleTri,
        input.largeur ?? null,
        input.hauteur ?? null,
        input.reference,
        input.prix,
        input.seuilAlerte,
        now,
        id
      );
  }

  /**
   * Suppression douce (Synthèse §9) — le produit n'est jamais détruit
   * physiquement, seulement marqué et tracé. Disparaît du catalogue actif
   * (list(), suggestions) sans perdre l'historique des ventes/mouvements
   * qui le référencent déjà.
   */
  softDelete(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE produits SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?")
      .run(now, deletedBy, now, id);
  }
}
