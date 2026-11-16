import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Categorie } from "@maxi-equip/shared-types";

/**
 * Fondations quincaillerie (Phase 1) — même patron exact que
 * ModeleRepository (liste active, création, modification, suppression
 * douce), jamais une seconde logique de suppression/traçabilité.
 */

interface CategorieRow {
  id: string;
  nom: string;
  image_data_url: string | null;
  ordre: number;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCategorie(row: CategorieRow): Categorie {
  return {
    id: row.id,
    nom: row.nom,
    imageDataUrl: row.image_data_url,
    ordre: row.ordre,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CategorieRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Categorie[] {
    const rows = this.db.prepare("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY ordre, nom").all() as CategorieRow[];
    return rows.map(rowToCategorie);
  }

  findById(id: string): Categorie | null {
    const row = this.db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategorieRow | undefined;
    return row ? rowToCategorie(row) : null;
  }

  create(input: { nom: string; imageDataUrl?: string | null; ordre?: number }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)"
      )
      .run(id, input.nom.trim(), input.imageDataUrl ?? null, input.ordre ?? 0, now, now);
    return id;
  }

  update(id: string, input: { nom?: string; imageDataUrl?: string | null; ordre?: number }): void {
    const now = new Date().toISOString();
    if (input.nom !== undefined) {
      this.db.prepare("UPDATE categories SET nom = ?, updated_at = ? WHERE id = ?").run(input.nom.trim(), now, id);
    }
    if (input.imageDataUrl !== undefined) {
      this.db.prepare("UPDATE categories SET image_data_url = ?, updated_at = ? WHERE id = ?").run(input.imageDataUrl, now, id);
    }
    if (input.ordre !== undefined) {
      this.db.prepare("UPDATE categories SET ordre = ?, updated_at = ? WHERE id = ?").run(input.ordre, now, id);
    }
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.4 — insère/met à jour une
   * catégorie reçue du serveur central. Même patron exact que
   * `ModeleRepository.creerDepuisServeur` : id serveur conservé tel quel
   * (jamais un nouvel UUID local), `UPDATE` si déjà présente sinon
   * `INSERT`. Aucune dépendance de clé étrangère sur cette table — jamais
   * besoin d'avaler une erreur FK ici (contrairement à
   * `SousCategorieRepository.creerDepuisServeur` ci-dessous, dépendante
   * de celle-ci).
   */
  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — `deletedAt` optionnel :
   * capacité de RÉCEPTION d'un tombstone émis par un autre poste
   * (`catalogue:supprimerCategorie`, soumis à sa propre garde bloquante
   * LOCALE — jamais réappliquée ici, voir §D du cahier des charges).
   * Les modèles/produits qui référencent encore cette catégorie (via
   * leur sous-catégorie) restent intacts : aucune cascade, le badge de
   * classification orpheline (voir ModeleRepository.listAvecStatutClassification)
   * signale la situation sans jamais rien supprimer ni bloquer.
   */
  creerDepuisServeur(categorie: { id: string; nom: string; imageDataUrl: string | null; ordre: number; updatedAt: string; deletedAt?: string | null }): void {
    const deletedAt = categorie.deletedAt ?? null;
    const existe = this.db.prepare("SELECT id FROM categories WHERE id = ?").get(categorie.id) as { id: string } | undefined;
    if (existe) {
      this.db
        .prepare("UPDATE categories SET nom = ?, image_data_url = ?, ordre = ?, deleted_at = ?, deleted_by = NULL, updated_at = ? WHERE id = ?")
        .run(categorie.nom, categorie.imageDataUrl, categorie.ordre, deletedAt, categorie.updatedAt, categorie.id);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .run(categorie.id, categorie.nom, categorie.imageDataUrl, categorie.ordre, deletedAt, categorie.updatedAt, categorie.updatedAt);
  }

  softDelete(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE categories SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, deletedBy, now, id);
  }

  /**
   * Nombre de modèles actifs rattachés à chaque catégorie (via sa/ses
   * sous-catégories) — pour les compteurs affichés sur les cartes de la
   * page catalogue (phase Catalogue, pas encore câblée). Une catégorie
   * sans aucun modèle n'apparaît pas dans le résultat (compteur
   * implicitement 0 côté appelant).
   */
  compterModelesParCategorie(): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT sc.categorie_id as categorieId, COUNT(*) as n
         FROM modeles_produit m
         JOIN sous_categories sc ON sc.id = m.sous_categorie_id
         WHERE m.deleted_at IS NULL AND sc.deleted_at IS NULL
         GROUP BY sc.categorie_id`
      )
      .all() as { categorieId: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.categorieId, r.n]));
  }
}
