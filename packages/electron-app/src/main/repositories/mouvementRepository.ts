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
}
