import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";

/**
 * Boîte d'envoi locale — Phase 3.3. Réutilise STRICTEMENT la table
 * `boite_envoi` déjà définie dans schema.sql lors de l'audit Phase 3
 * (jamais une deuxième table créée, jamais une logique dupliquée) :
 *
 *   id, entity_type, entity_id, payload_json,
 *   status ('pending' | 'sent' | 'confirmed' | 'error'),
 *   attempts, next_attempt_at, last_error, created_at, updated_at
 *
 * RÔLE STRICTEMENT LIMITÉ à cette étape : conserver correctement les
 * opérations en attente d'une synchronisation future. Aucune tentative
 * de contacter un serveur, aucun calcul de backoff réel — uniquement le
 * dépôt des données et la lecture/mise à jour de leur statut.
 *
 * `entity_type`/`entity_id` identifient l'opération SANS dupliquer toute
 * la base : `entity_id` est l'UUID technique déjà existant de l'entité
 * concernée (`factures.id` pour une vente/annulation, `mouvements.id`
 * pour une entrée/transfert) — jamais un nouvel identifiant inventé.
 * `payload_json` contient uniquement les champs métier nécessaires à une
 * future synchronisation, jamais un instantané complet de toute la base.
 */
export type TypeOperationBoiteEnvoi = "vente" | "annulation" | "entree" | "transfert" | "parametres_entreprise" | "promotion";
export type StatutBoiteEnvoi = "pending" | "sent" | "confirmed" | "error";

export interface EntreeBoiteEnvoi {
  id: string;
  entityType: string;
  entityId: string;
  payloadJson: string;
  status: StatutBoiteEnvoi;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EntreeBoiteEnvoiRow {
  id: string;
  entity_type: string;
  entity_id: string;
  payload_json: string;
  status: StatutBoiteEnvoi;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntree(row: EntreeBoiteEnvoiRow): EntreeBoiteEnvoi {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payloadJson: row.payload_json,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BoiteEnvoiRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Ajoute une opération en attente — statut initial toujours `pending`
   * (§7 : "EN ATTENTE → PRÊTE POUR SYNCHRONISATION FUTURE", jamais un
   * envoi tenté ici). `payload` est sérialisé tel quel en JSON — c'est
   * à l'appelant (chaque service métier) de construire un objet
   * raisonnablement scopé, jamais un instantané de toute la base.
   */
  creer(entityType: TypeOperationBoiteEnvoi, entityId: string, payload: unknown): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO boite_envoi (id, entity_type, entity_id, payload_json, status, attempts, next_attempt_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?)`
      )
      .run(id, entityType, entityId, JSON.stringify(payload), now, now);
    return id;
  }

  /** Entrées réellement en attente (jamais celles déjà confirmées/envoyées) — ordre de création, la plus ancienne d'abord (ordre naturel d'envoi futur). */
  listerEnAttente(): EntreeBoiteEnvoi[] {
    const rows = this.db.prepare("SELECT * FROM boite_envoi WHERE status = 'pending' ORDER BY created_at ASC").all() as EntreeBoiteEnvoiRow[];
    return rows.map(rowToEntree);
  }

  findById(id: string): EntreeBoiteEnvoi | null {
    const row = this.db.prepare("SELECT * FROM boite_envoi WHERE id = ?").get(id) as EntreeBoiteEnvoiRow | undefined;
    return row ? rowToEntree(row) : null;
  }

  /** Toutes les entrées liées à une entité donnée — utile pour vérifier qu'une facture/mouvement a bien été mis en attente (Partie 10 : consultation technique). */
  listerParEntite(entityType: TypeOperationBoiteEnvoi, entityId: string): EntreeBoiteEnvoi[] {
    const rows = this.db
      .prepare("SELECT * FROM boite_envoi WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC")
      .all(entityType, entityId) as EntreeBoiteEnvoiRow[];
    return rows.map(rowToEntree);
  }

  mettreAJourStatut(id: string, status: StatutBoiteEnvoi): void {
    this.db.prepare("UPDATE boite_envoi SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  }

  /**
   * Enregistre une tentative échouée — incrémente `attempts`, note
   * `last_error`, bascule le statut en `error`. Ne calcule PAS de vrai
   * `next_attempt_at` (aucun moteur de retry automatique à cette étape,
   * §8) — la colonne reste disponible pour la phase qui implémentera
   * réellement le backoff, jamais devinée arbitrairement ici.
   */
  enregistrerErreur(id: string, message: string): void {
    this.db
      .prepare("UPDATE boite_envoi SET status = 'error', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?")
      .run(message, new Date().toISOString(), id);
  }

  /** Répartition par statut — utile pour une vérification technique rapide (Partie 10), jamais un nouvel écran utilisateur. */
  compterParStatut(): Record<string, number> {
    const rows = this.db.prepare("SELECT status, COUNT(*) as n FROM boite_envoi GROUP BY status").all() as { status: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  /**
   * Opérations prêtes à être (ré)envoyées — Phase 3.7, Partie 5 : inclut
   * `pending` (jamais encore tentée) ET `error` (tentative précédente
   * en échec — erreur réseau ou refus serveur, toujours disponible pour
   * une nouvelle tentative manuelle, jamais un abandon silencieux).
   * `confirmed`/`sent` ne sont JAMAIS renvoyées ici.
   */
  listerPretesPourEnvoi(): EntreeBoiteEnvoi[] {
    const rows = this.db.prepare("SELECT * FROM boite_envoi WHERE status IN ('pending', 'error') ORDER BY created_at ASC").all() as EntreeBoiteEnvoiRow[];
    return rows.map(rowToEntree);
  }
}
