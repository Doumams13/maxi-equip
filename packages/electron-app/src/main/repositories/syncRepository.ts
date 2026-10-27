import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";

/**
 * Curseur local + journal technique des opérations reçues via PULL —
 * Phase 3.7, Parties 10/11/18. STRICTEMENT technique : jamais une
 * écriture sur une table métier (produits, stocks, ventes, factures...),
 * conformément à la Partie 9 ("le serveur stocke des opérations
 * techniques et ne possède pas encore un moteur métier complet").
 */
export interface OperationRecueSync {
  entityType: string;
  entityId: string;
  payload: unknown;
  curseurServeur: number;
}

export class SyncRepository {
  constructor(private readonly db: Database.Database) {}

  getDernierCurseur(): number {
    const row = this.db.prepare("SELECT dernier_curseur FROM sync_etat WHERE id = 'singleton'").get() as { dernier_curseur: number } | undefined;
    return row?.dernier_curseur ?? 0;
  }

  /**
   * Enregistre les opérations reçues ET avance le curseur DANS LA MÊME
   * TRANSACTION (Partie 18 : "ne jamais laisser CURSOR AVANCÉ mais
   * DONNÉES PULL PERDUES"). Si `operations` est vide, le curseur n'est
   * pas modifié.
   */
  enregistrerOperationsRecues(operations: OperationRecueSync[]): void {
    if (operations.length === 0) return;
    const executer = this.db.transaction(() => {
      const maintenant = new Date().toISOString();
      const inserer = this.db.prepare(
        "INSERT OR IGNORE INTO sync_recu (id, curseur_serveur, entity_type, entity_id, payload_json, recu_le, applique) VALUES (?, ?, ?, ?, ?, ?, 0)"
      );
      let curseurMax = this.getDernierCurseur();
      for (const op of operations) {
        inserer.run(randomUUID(), op.curseurServeur, op.entityType, op.entityId, JSON.stringify(op.payload), maintenant);
        if (op.curseurServeur > curseurMax) curseurMax = op.curseurServeur;
      }
      this.db.prepare("UPDATE sync_etat SET dernier_curseur = ?, updated_at = ? WHERE id = 'singleton'").run(curseurMax, maintenant);
    });
    executer();
  }

  /**
   * Correction "visibilité croisée Factures/Historique entre postes"
   * (2026-10-27), Phase 4 — voir `applique` (migrate.ts) pour le
   * raisonnement complet. `curseurServeur` comme clé (déjà UNIQUE),
   * jamais `entity_id` seul (un entity_id pourrait coïncider entre deux
   * entity_type différents, même si improbable avec des UUID).
   */
  marquerApplique(curseurServeur: number): void {
    this.db.prepare("UPDATE sync_recu SET applique = 1 WHERE curseur_serveur = ?").run(curseurServeur);
  }

  /**
   * Opérations reçues mais jamais appliquées avec succès — retentées à
   * chaque cycle de synchronisation (voir SyncService), jusqu'à ce que
   * leurs dépendances (dépôt/compte/produit) soient enfin connues
   * localement. Bornée (même principe que le PULL lui-même, voir
   * pull.ts) — jamais un balayage illimité en un seul cycle.
   */
  listerNonAppliquees(entityTypes: string[], limite = 200): OperationRecueSync[] {
    if (entityTypes.length === 0) return [];
    const placeholders = entityTypes.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT curseur_serveur, entity_type, entity_id, payload_json FROM sync_recu WHERE applique = 0 AND entity_type IN (${placeholders}) ORDER BY curseur_serveur ASC LIMIT ?`)
      .all(...entityTypes, limite) as { curseur_serveur: number; entity_type: string; entity_id: string; payload_json: string }[];
    return rows.map((r) => ({ curseurServeur: r.curseur_serveur, entityType: r.entity_type, entityId: r.entity_id, payload: JSON.parse(r.payload_json) as unknown }));
  }
}
