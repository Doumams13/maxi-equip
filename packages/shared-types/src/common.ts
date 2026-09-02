/**
 * Types communs à toutes les entités.
 *
 * Décisions d'architecture appliquées ici (Synthèse §6, Corrections §2/§3) :
 * - Identifiant unique universel (UUID v4), généré côté client, jamais par la base.
 * - Horodatage systématique de dernière modification sur chaque entité métier.
 * - Les entités "métier" (partagées local/cloud) et les entités "techniques"
 *   (locales uniquement : boîte d'envoi, journal de sauvegardes, archive PDF)
 *   sont distinguées explicitement — voir isTechnicalOnly ci-dessous.
 */

/** UUID v4 sous forme de chaîne. Généré localement à la création d'un enregistrement. */
export type UUID = string;

/** Date/heure au format ISO 8601 (toujours en UTC en stockage). */
export type ISODateTime = string;

/**
 * Champs présents sur toute entité métier partagée entre la base locale
 * et la base cloud (Synthèse §6 — "schéma miroir").
 */
export interface MetierEntity {
  id: UUID;
  createdAt: ISODateTime;
  /** Horodatage de dernière modification — alimente la synchronisation "pull". */
  updatedAt: ISODateTime;
}

/**
 * Statut de synchronisation d'un enregistrement créé localement.
 * Existe uniquement côté application (table boîte d'envoi), jamais côté cloud.
 * Cf. Synthèse §7 et Corrections §3.
 */
export type SyncStatus = "pending" | "sent" | "confirmed" | "error";

/**
 * Marqueur de suppression "douce", utilisé pour les données de gestion
 * supprimées par un compte Gérant (Synthèse §9). La donnée n'est jamais
 * détruite physiquement ; elle est marquée et tracée pour l'administrateur.
 *
 * À NE PAS confondre avec la purge réelle des demandes non confirmées
 * après 7 jours (Corrections §7), qui est une suppression physique motivée
 * par la protection des données personnelles.
 */
export interface SoftDeletable {
  deletedAt: ISODateTime | null;
  deletedBy: UUID | null;
}
