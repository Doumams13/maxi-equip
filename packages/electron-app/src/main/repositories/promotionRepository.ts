import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Promotion } from "@maxi-equip/shared-types";

interface PromotionRow {
  id: string;
  libelle: string;
  type_reduction: string;
  valeur: number;
  perimetre: string;
  date_debut: string;
  date_fin: string;
  created_at: string;
  updated_at: string;
}

function rowToPromotion(row: PromotionRow, produitIds: string[]): Promotion {
  return {
    id: row.id,
    libelle: row.libelle,
    typeReduction: row.type_reduction as Promotion["typeReduction"],
    valeur: row.valeur,
    perimetre: row.perimetre as Promotion["perimetre"],
    produitIds,
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PromotionRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Promotion[] {
    const rows = this.db
      .prepare("SELECT * FROM promotions ORDER BY date_debut DESC")
      .all() as PromotionRow[];
    return rows.map((row) => rowToPromotion(row, this.getProduitIds(row.id)));
  }

  listActives(atDate: string = new Date().toISOString()): Promotion[] {
    const rows = this.db
      .prepare("SELECT * FROM promotions WHERE date_debut <= ? AND date_fin >= ? ORDER BY date_debut DESC")
      .all(atDate, atDate) as PromotionRow[];
    return rows.map((row) => rowToPromotion(row, this.getProduitIds(row.id)));
  }

  findById(id: string): Promotion | null {
    const row = this.db.prepare("SELECT * FROM promotions WHERE id = ?").get(id) as PromotionRow | undefined;
    return row ? rowToPromotion(row, this.getProduitIds(id)) : null;
  }

  /**
   * Retourne les promotions actives à la date donnée qui s'appliquent à
   * un produit spécifique — soit parce qu'elles sont globales, soit parce
   * que ce produit est dans leur liste ciblée.
   */
  listActivesParProduit(produitId: string, atDate: string = new Date().toISOString()): Promotion[] {
    const actives = this.listActives(atDate);
    return actives.filter(
      (p) => p.perimetre === "global" || p.produitIds.includes(produitId)
    );
  }

  compterActives(atDate: string = new Date().toISOString()): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM promotions WHERE date_debut <= ? AND date_fin >= ?")
      .get(atDate, atDate) as { n: number };
    return row.n;
  }

  /**
   * Bilan d'activité (2026-10-21) — nombre de promotions ayant chevauché
   * (même partiellement) la période [debut, fin], contrairement à
   * compterActives() ci-dessus qui ne regarde qu'un seul instant. Deux
   * intervalles [date_debut, date_fin] et [debut, fin] se chevauchent
   * ssi date_debut <= fin ET date_fin >= debut.
   */
  compterChevauchantPeriode(debut: string, fin: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM promotions WHERE date_debut <= ? AND date_fin >= ?")
      .get(fin, debut) as { n: number };
    return row.n;
  }

  create(input: Omit<Promotion, "id" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO promotions (id, libelle, type_reduction, valeur, perimetre, date_debut, date_fin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.libelle, input.typeReduction, input.valeur, input.perimetre, input.dateDebut, input.dateFin, now, now);

    if (input.perimetre === "cible") {
      const insertProduit = this.db.prepare(
        "INSERT INTO promotion_produits (promotion_id, produit_id) VALUES (?, ?)"
      );
      for (const produitId of input.produitIds) {
        insertProduit.run(id, produitId);
      }
    }

    return id;
  }

  update(id: string, input: Partial<Omit<Promotion, "id" | "createdAt" | "updatedAt">>): void {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.libelle !== undefined) { fields.push("libelle = ?"); values.push(input.libelle); }
    if (input.typeReduction !== undefined) { fields.push("type_reduction = ?"); values.push(input.typeReduction); }
    if (input.valeur !== undefined) { fields.push("valeur = ?"); values.push(input.valeur); }
    if (input.perimetre !== undefined) { fields.push("perimetre = ?"); values.push(input.perimetre); }
    if (input.dateDebut !== undefined) { fields.push("date_debut = ?"); values.push(input.dateDebut); }
    if (input.dateFin !== undefined) { fields.push("date_fin = ?"); values.push(input.dateFin); }

    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(now);
      values.push(id);
      this.db.prepare(`UPDATE promotions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    if (input.produitIds !== undefined) {
      this.db.prepare("DELETE FROM promotion_produits WHERE promotion_id = ?").run(id);
      const perimetre = input.perimetre ?? (this.findById(id)?.perimetre);
      if (perimetre === "cible") {
        const insertProduit = this.db.prepare(
          "INSERT INTO promotion_produits (promotion_id, produit_id) VALUES (?, ?)"
        );
        for (const produitId of input.produitIds) {
          insertProduit.run(id, produitId);
        }
      }
    }
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM promotions WHERE id = ?").run(id);
  }

  /**
   * Détecte un conflit de planification : retourne les promotions qui
   * chevauchent la période donnée ET affectent les mêmes produits.
   *
   * Règles de conflit :
   * - global vs global : conflict si les périodes se chevauchent.
   * - global vs cible  : conflict si les périodes se chevauchent.
   * - cible  vs cible  : conflict si les périodes se chevauchent ET au
   *   moins un produit est partagé.
   *
   * @param excludeId Identifiant à exclure (utile pour la modification d'une promotion existante).
   */
  detecterConflit(input: {
    perimetre: Promotion["perimetre"];
    produitIds: string[];
    dateDebut: string;
    dateFin: string;
    excludeId?: string;
  }): Promotion[] {
    const chevauchantes = this.db
      .prepare(
        `SELECT * FROM promotions
         WHERE date_debut < ? AND date_fin > ?
         ${input.excludeId ? "AND id != ?" : ""}`
      )
      .all(
        ...(input.excludeId
          ? [input.dateFin, input.dateDebut, input.excludeId]
          : [input.dateFin, input.dateDebut])
      ) as PromotionRow[];

    if (chevauchantes.length === 0) return [];

    const conflictuelles: Promotion[] = [];
    for (const row of chevauchantes) {
      const existante = rowToPromotion(row, this.getProduitIds(row.id));

      if (input.perimetre === "global" || existante.perimetre === "global") {
        // Au moins l'une des deux est globale → conflit systématique si les dates se chevauchent.
        conflictuelles.push(existante);
      } else {
        // Les deux sont ciblées → conflit seulement si au moins un produit est partagé.
        const partage = input.produitIds.some((pid) => existante.produitIds.includes(pid));
        if (partage) conflictuelles.push(existante);
      }
    }
    return conflictuelles;
  }

  private getProduitIds(promotionId: string): string[] {
    const rows = this.db
      .prepare("SELECT produit_id FROM promotion_produits WHERE promotion_id = ?")
      .all(promotionId) as { produit_id: string }[];
    return rows.map((r) => r.produit_id);
  }
}
