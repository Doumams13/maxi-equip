import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { ModeleProduit } from "@maxi-equip/shared-types";

interface ModeleRow {
  id: string;
  motif: string;
  type: string;
  ordre_vitrine: number | null;
  sous_categorie_id: string | null;
  marque: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToModele(row: ModeleRow): ModeleProduit {
  return {
    id: row.id,
    motif: row.motif,
    type: row.type,
    ordreVitrine: row.ordre_vitrine,
    sousCategorieId: row.sous_categorie_id,
    marque: row.marque,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ModeleRepository {
  constructor(private readonly db: Database.Database) {}

  list(): ModeleProduit[] {
    const rows = this.db
      .prepare("SELECT * FROM modeles_produit WHERE deleted_at IS NULL ORDER BY type, motif")
      .all() as ModeleRow[];
    return rows.map(rowToModele);
  }

  findById(id: string): ModeleProduit | null {
    const row = this.db.prepare("SELECT * FROM modeles_produit WHERE id = ?").get(id) as ModeleRow | undefined;
    return row ? rowToModele(row) : null;
  }

  create(input: { motif: string; type: string; sousCategorieId?: string | null; marque?: string | null }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, marque, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)"
      )
      .run(id, input.motif.trim(), input.type.trim(), input.sousCategorieId ?? null, input.marque?.trim() || null, now, now);
    return id;
  }

  /**
   * Insère/met à jour un modèle reçu du serveur central — correction
   * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
   * Phase 2. Conserve l'`id` EXACT d'origine (jamais un nouvel UUID
   * local, même principe que `emplacementRepository.creerDepuisServeur`)
   * — c'est cet id partagé qui permettra à un produit/une facture/un
   * mouvement reçu d'un autre poste de résoudre sa clé étrangère
   * `modele_id`/`produit_id` localement. Aucune dépendance de clé
   * étrangère sur cette table : jamais besoin d'avaler une erreur FK
   * ici (contrairement à `ProduitRepository.creerDepuisServeur`
   * ci-dessous, dépendant de celle-ci).
   */
  creerDepuisServeur(modele: {
    id: string;
    motif: string;
    type: string;
    ordreVitrine: number | null;
    // Phase 5 (référentiel commun), sous-phase 5.5 — absents (ancien serveur/ancien payload) traités comme null, jamais inventés.
    sousCategorieId?: string | null;
    marque?: string | null;
  }): void {
    const now = new Date().toISOString();
    const sousCategorieId = modele.sousCategorieId ?? null;
    const marque = modele.marque ?? null;
    const existe = this.db.prepare("SELECT id FROM modeles_produit WHERE id = ?").get(modele.id) as { id: string } | undefined;
    if (existe) {
      this.db
        .prepare("UPDATE modeles_produit SET motif = ?, type = ?, ordre_vitrine = ?, sous_categorie_id = ?, marque = ?, updated_at = ? WHERE id = ?")
        .run(modele.motif, modele.type, modele.ordreVitrine, sousCategorieId, marque, now, modele.id);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO modeles_produit (id, motif, type, ordre_vitrine, sous_categorie_id, marque, deleted_at, deleted_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
      )
      .run(modele.id, modele.motif, modele.type, modele.ordreVitrine, sousCategorieId, marque, now, now);
  }

  update(id: string, input: { motif?: string; type?: string; sousCategorieId?: string | null; marque?: string | null }): void {
    const now = new Date().toISOString();
    if (input.motif !== undefined) {
      this.db.prepare("UPDATE modeles_produit SET motif = ?, updated_at = ? WHERE id = ?").run(input.motif.trim(), now, id);
    }
    if (input.type !== undefined) {
      this.db.prepare("UPDATE modeles_produit SET type = ?, updated_at = ? WHERE id = ?").run(input.type.trim(), now, id);
    }
    if (input.sousCategorieId !== undefined) {
      this.db.prepare("UPDATE modeles_produit SET sous_categorie_id = ?, updated_at = ? WHERE id = ?").run(input.sousCategorieId, now, id);
    }
    if (input.marque !== undefined) {
      this.db.prepare("UPDATE modeles_produit SET marque = ?, updated_at = ? WHERE id = ?").run(input.marque?.trim() || null, now, id);
    }
  }

  softDelete(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE modeles_produit SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, deletedBy, now, id);
  }

  /**
   * Définit la sélection ET l'ordre des modèles affichés dans la vitrine
   * du site public — correction "choisir quels carreaux s'affichent en
   * première page" (2026-10-07). `modeleIdsOrdonnes` est la liste
   * complète et ordonnée des modèles sélectionnés (position 0 = premier
   * affiché) : tout modèle actif absent de cette liste voit son
   * `ordreVitrine` remis à NULL (retiré de la vitrine), jamais seulement
   * les modèles ajoutés — sinon il serait impossible de retirer un
   * modèle déjà sélectionné.
   *
   * Retourne uniquement les modèles dont `ordreVitrine` a RÉELLEMENT
   * changé (comparé à l'état avant l'appel), pour que l'appelant (IPC)
   * ne pousse en synchronisation que ce qui a effectivement bougé —
   * jamais tout le catalogue à chaque enregistrement.
   */
  definirVitrine(modeleIdsOrdonnes: string[]): ModeleProduit[] {
    const avant = new Map(this.list().map((m) => [m.id, m.ordreVitrine]));
    const nouvelOrdre = new Map(modeleIdsOrdonnes.map((id, index) => [id, index]));
    const now = new Date().toISOString();

    const touchés: ModeleProduit[] = [];
    const transaction = this.db.transaction(() => {
      for (const [id, ordreAvant] of avant) {
        const ordreApres = nouvelOrdre.get(id) ?? null;
        if (ordreAvant === ordreApres) continue;
        this.db.prepare("UPDATE modeles_produit SET ordre_vitrine = ?, updated_at = ? WHERE id = ?").run(ordreApres, now, id);
        touchés.push(this.findById(id)!);
      }
    });
    transaction();

    return touchés;
  }

  /** Valeurs déjà utilisées pour "type" — autocomplétion. */
  distinctTypes(): string[] {
    return (
      this.db.prepare("SELECT DISTINCT type FROM modeles_produit WHERE deleted_at IS NULL ORDER BY type").all() as { type: string }[]
    ).map((r) => r.type);
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — garde bloquante pour
   * `catalogue:supprimerSousCategorie` : une sous-catégorie ne peut être
   * supprimée tant qu'un modèle ACTIF (non supprimé) la référence
   * encore. Équivalent exact à `modeles_produit.sous_categorie_id = ?
   * AND deleted_at IS NULL` — simple test d'existence (`LIMIT 1`),
   * jamais un comptage complet (inutile pour une garde booléenne). Les
   * produits associés à ces modèles sont protégés PAR CETTE MÊME garde
   * (un produit ne peut exister sans modèle actif) — jamais une
   * deuxième règle redondante.
   */
  existeModeleActifPourSousCategorie(sousCategorieId: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM modeles_produit WHERE sous_categorie_id = ? AND deleted_at IS NULL LIMIT 1").get(sousCategorieId);
    return row !== undefined;
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — badge de
   * classification orpheline : un modèle dont la sous-catégorie (ou,
   * transitivement, la catégorie) référencée a été supprimée par un
   * autre poste (tombstone reçu, voir SousCategorieRepository/
   * CategorieRepository.creerDepuisServeur) reste PARFAITEMENT intact
   * et lisible — seul un indicateur dérivé, calculé à la lecture via
   * `LEFT JOIN` (jamais une colonne persistée, jamais un recalcul
   * stocké), signale la situation à l'utilisateur. `sousCategorieId`
   * `NULL` (modèle jamais classé) donne `sousCategorieSupprimee: false`
   * (rien à signaler), cohérent avec le comportement historique.
   */
  listAvecStatutClassification(): Array<ModeleProduit & { sousCategorieSupprimee: boolean; categorieSupprimee: boolean }> {
    const rows = this.db
      .prepare(
        `SELECT m.*,
                CASE WHEN m.sous_categorie_id IS NOT NULL AND sc.deleted_at IS NOT NULL THEN 1 ELSE 0 END as sous_categorie_supprimee,
                CASE WHEN m.sous_categorie_id IS NOT NULL AND c.deleted_at IS NOT NULL THEN 1 ELSE 0 END as categorie_supprimee
         FROM modeles_produit m
         LEFT JOIN sous_categories sc ON sc.id = m.sous_categorie_id
         LEFT JOIN categories c ON c.id = sc.categorie_id
         WHERE m.deleted_at IS NULL
         ORDER BY m.type, m.motif`
      )
      .all() as (ModeleRow & { sous_categorie_supprimee: number; categorie_supprimee: number })[];
    return rows.map((row) => ({
      ...rowToModele(row),
      sousCategorieSupprimee: row.sous_categorie_supprimee === 1,
      categorieSupprimee: row.categorie_supprimee === 1,
    }));
  }
}
