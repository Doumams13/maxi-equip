import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Produit } from "@maxi-equip/shared-types";

interface ProduitRow {
  id: string;
  modele_id: string | null;
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
    modeleId: row.modele_id,
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

  /**
   * Nombre de produits dont le stock CUMULÉ sur les dépôts donnés est sous
   * leur seuil d'alerte — jamais SHOP (décision métier §3/§9 de la
   * correction). Remplace l'ancienne version qui comparait le stock d'un
   * seul emplacement à la fois, ce qui ne correspondait pas à la règle
   * "stock Akébé + Akanda cumulé".
   */
  countSousSeuilDepots(depotIds: string[]): number {
    return this.listSousSeuilDepots(depotIds).length;
  }

  /** Produits sous seuil, avec leur stock cumulé sur les dépôts donnés — section "Produits en stock faible" du dashboard (§8/§13). */
  listSousSeuilDepots(depotIds: string[]): { id: string; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[] {
    if (depotIds.length === 0) return [];
    const placeholders = depotIds.map(() => "?").join(",");
    // IMPORTANT : HAVING sans GROUP BY n'est pas valide en SQLite sur une
    // requête non agrégée (erreur "HAVING clause on a non-aggregate
    // query", reproduite et confirmée) — le filtre sur la colonne
    // calculée "stock" doit donc se faire via un WHERE sur une
    // sous-requête, pas un HAVING direct.
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT p.id, p.motif, p.type, p.taille, p.seuil_alerte as seuilAlerte,
                  COALESCE((SELECT SUM(s.quantite) FROM stocks s WHERE s.produit_id = p.id AND s.emplacement_id IN (${placeholders})), 0) as stock
           FROM produits p
           WHERE p.deleted_at IS NULL AND p.seuil_alerte > 0
         )
         WHERE stock <= seuilAlerte
         ORDER BY stock ASC`
      )
      .all(...depotIds) as { id: string; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[];
    return rows;
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

  /** Variantes d'un modèle donné (actives uniquement). */
  listByModele(modeleId: string): Produit[] {
    const rows = this.db
      .prepare("SELECT * FROM produits WHERE modele_id = ? AND deleted_at IS NULL ORDER BY taille_tri, taille")
      .all(modeleId) as ProduitRow[];
    return rows.map(rowToProduit);
  }

  create(input: {
    modeleId?: string | null;
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
        `INSERT INTO produits (id, modele_id, motif, type, taille, taille_tri, largeur, hauteur, reference, prix, seuil_alerte, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.modeleId ?? null,
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

  /** Modifie une variante. Ne touche jamais aux images (gérées séparément via ImageService). */
  update(
    id: string,
    input: {
      motif?: string;
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
    if (input.motif !== undefined) {
      this.db
        .prepare(
          `UPDATE produits
           SET motif = ?, type = ?, taille = ?, taille_tri = ?, largeur = ?, hauteur = ?, reference = ?, prix = ?, seuil_alerte = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(input.motif, input.type, input.taille, input.tailleTri, input.largeur ?? null, input.hauteur ?? null, input.reference, input.prix, input.seuilAlerte, now, id);
    } else {
      this.db
        .prepare(
          `UPDATE produits
           SET type = ?, taille = ?, taille_tri = ?, largeur = ?, hauteur = ?, reference = ?, prix = ?, seuil_alerte = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(input.type, input.taille, input.tailleTri, input.largeur ?? null, input.hauteur ?? null, input.reference, input.prix, input.seuilAlerte, now, id);
    }
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
