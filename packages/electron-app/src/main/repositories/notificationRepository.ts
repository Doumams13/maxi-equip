import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Notification, NotificationType } from "@maxi-equip/shared-types";

interface NotificationRow {
  id: string;
  type: NotificationType;
  titre: string;
  message: string;
  lue: number;
  demande_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  poste_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    titre: row.titre,
    message: row.message,
    lue: row.lue === 1,
    demandeId: row.demande_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    posteId: row.poste_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotificationRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * `origine` — système multiposte fiable (2026-10-28) : UNIQUEMENT pour
   * vente/entree/sortie/transfert (voir SyncApplicationService), jamais
   * pour "demande" qui continue d'utiliser `demandeId` positionnel
   * ci-dessus (aucun site d'appel existant cassé).
   */
  creer(
    type: NotificationType,
    titre: string,
    message: string,
    demandeId: string | null = null,
    origine?: { entityType: string; entityId: string; posteId: string | null }
  ): Notification {
    const id = randomUUID();
    const maintenant = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO notifications (id, type, titre, message, lue, demande_id, entity_type, entity_id, poste_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, type, titre, message, demandeId, origine?.entityType ?? null, origine?.entityId ?? null, origine?.posteId ?? null, maintenant, maintenant);
    return this.findById(id)!;
  }

  findById(id: string): Notification | null {
    const row = this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationRow | undefined;
    return row ? rowToNotification(row) : null;
  }

  listerRecentes(limite = 30): Notification[] {
    const rows = this.db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?").all(limite) as NotificationRow[];
    return rows.map(rowToNotification);
  }

  compterNonLues(): number {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM notifications WHERE lue = 0").get() as { n: number };
    return row.n;
  }

  marquerLue(id: string): void {
    this.db.prepare("UPDATE notifications SET lue = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  marquerToutesLues(): void {
    this.db.prepare("UPDATE notifications SET lue = 1, updated_at = ? WHERE lue = 0").run(new Date().toISOString());
  }
}
