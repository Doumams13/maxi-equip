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
        "INSERT OR IGNORE INTO sync_recu (id, curseur_serveur, entity_type, entity_id, payload_json, recu_le) VALUES (?, ?, ?, ?, ?, ?)"
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
}
