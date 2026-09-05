import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Mouvement } from "@maxi-equip/shared-types";

interface MouvementRow {
  id: string;
  type: string;
  produit_id: string;
  emplacement_id: string | null;
  emplacement_source_id: string | null;
  emplacement_destination_id: string | null;
  quantite: number;
  date: string;
  facture_id: string | null;
  note: string | null;
}

function rowToMouvement(row: MouvementRow): Mouvement {
  return {
    id: row.id,
    type: row.type as Mouvement["type"],
    produitId: row.produit_id,
    emplacementId: row.emplacement_id,
    emplacementSourceId: row.emplacement_source_id,
    emplacementDestinationId: row.emplacement_destination_id,
    quantite: row.quantite,
    date: row.date,
    factureId: row.facture_id,
    note: row.note,
    createdAt: "",
    updatedAt: "",
  };
}

export class MouvementRepository {
  constructor(private readonly db: Database.Database) {}

  /** Historique le plus récent d'abord, limité (cahier des charges §14 — filtres de période à venir en Phase 3+). */
  list(limit = 100): Mouvement[] {
    const rows = this.db.prepare("SELECT * FROM mouvements ORDER BY date DESC LIMIT ?").all(limit) as MouvementRow[];
    return rows.map(rowToMouvement);
  }

  listRecent(limit = 5): Mouvement[] {
    return this.list(limit);
  }

  create(input: Omit<Mouvement, "id" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mouvements
         (id, type, produit_id, emplacement_id, emplacement_source_id, emplacement_destination_id, quantite, date, facture_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.type,
        input.produitId,
        input.emplacementId,
        input.emplacementSourceId,
        input.emplacementDestinationId,
        input.quantite,
        input.date,
        input.factureId,
        input.note,
        now,
        now
      );
    return id;
  }

  /** Somme des quantités pour un type de mouvement, toutes périodes — dashboard (§3/§13 de la correction). */
  sommeQuantiteParType(type: Mouvement["type"]): number {
    return (
      this.db.prepare("SELECT COALESCE(SUM(quantite), 0) as total FROM mouvements WHERE type = ?").get(type) as { total: number }
    ).total;
  }

  /**
   * Série Entrées/Sorties des 7 derniers jours, un point par jour
   * (§5 de la correction — graphique du dashboard). Un jour sans
   * mouvement retourne explicitement 0, jamais une valeur inventée.
   */
  serieEntreesSortiesSeptJours(): { jour: string; entrees: number; sorties: number }[] {
    const rows = this.db
      .prepare(
        `SELECT date(date) as jour, type, SUM(quantite) as total FROM mouvements
         WHERE date(date) >= date('now', '-6 days') AND type IN ('entree', 'sortie')
         GROUP BY date(date), type`
      )
      .all() as { jour: string; type: string; total: number }[];

    const resultat: { jour: string; entrees: number; sorties: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const entree = rows.find((r) => r.jour === iso && r.type === "entree")?.total ?? 0;
      const sortie = rows.find((r) => r.jour === iso && r.type === "sortie")?.total ?? 0;
      resultat.push({ jour: iso, entrees: entree, sorties: sortie });
    }
    return resultat;
  }
}
