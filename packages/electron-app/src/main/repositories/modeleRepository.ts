import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { ModeleProduit } from "@maxi-equip/shared-types";

interface ModeleRow {
  id: string;
  motif: string;
  type: string;
  ordre_vitrine: number | null;
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

  create(input: { motif: string; type: string }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO modeles_produit (id, motif, type, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)")
      .run(id, input.motif.trim(), input.type.trim(), now, now);
    return id;
  }

  update(id: string, input: { motif?: string; type?: string }): void {
    const now = new Date().toISOString();
    if (input.motif !== undefined) {
      this.db.prepare("UPDATE modeles_produit SET motif = ?, updated_at = ? WHERE id = ?").run(input.motif.trim(), now, id);
    }
    if (input.type !== undefined) {
      this.db.prepare("UPDATE modeles_produit SET type = ?, updated_at = ? WHERE id = ?").run(input.type.trim(), now, id);
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
}
