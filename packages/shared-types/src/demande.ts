import type { MetierEntity, UUID } from "./common.js";

/**
 * Demande de commande créée depuis le site vitrine (§8). N'est jamais une
 * vente tant qu'elle n'est pas confirmée (§14). Purgée définitivement
 * 7 jours après création si non confirmée en facture, quel que soit son
 * statut — décision explicite MAXI EQUIP (Corrections §7).
 */
export type DemandeStatut =
  "nouvelle" | "en_cours" | "a_contacter" | "contactee" | "confirmee" | "refusee" | "annulee";

export interface Demande extends MetierEntity {
  numero: string;
  statut: DemandeStatut;

  clientNom: string;
  clientTelephone: string;
  clientAdresse: string;
  /** Facultatif — cahier des charges §8 : "Email facultatif". */
  clientEmail: string | null;
  commentaire: string | null;

  lignes: LigneDemande[];

  /** Renseigné uniquement lorsque la demande est confirmée en vente. */
  factureId: UUID | null;
  refusMotif: string | null;
}

export interface LigneDemande {
  produitId: UUID;
  motif: string;
  taille: string;
  quantite: number;
  prixIndicatif: number;
}

/**
 * Système multiposte fiable (2026-10-28) — 4 types ajoutés : une
 * notification pour chaque vente/entrée/sortie/transfert VALIDÉ reçu
 * d'un autre poste (voir SyncApplicationService côté Electron), jamais
 * pour une tentative refusée ou en attente.
 */
export type NotificationType = "demande" | "stock" | "sync" | "vente" | "entree" | "sortie" | "transfert";

export interface Notification extends MetierEntity {
  type: NotificationType;
  titre: string;
  message: string;
  lue: boolean;
  /** Permet l'ouverture directe de la demande concernée au clic (§8). */
  demandeId: UUID | null;
  /**
   * Système multiposte fiable (2026-10-28) — renseignés UNIQUEMENT pour
   * vente/entree/sortie/transfert (jamais demande/stock/sync, qui
   * utilisent déjà `demandeId` ou n'ont besoin d'aucune ouverture
   * directe). `entityId` = factureId pour une vente, mouvementId pour
   * les trois autres — jamais détourner `demandeId` pour ce besoin.
   */
  entityType: string | null;
  entityId: UUID | null;
  /**
   * Identifiant technique du poste à l'origine de l'opération (voir
   * serverStorage.ts/PosteRow côté API) — toujours déduit par le
   * serveur depuis le jeton de la requête `/v1/sync/push`, jamais
   * déclaré par le client poussant l'opération. `null` pour les
   * notifications historiques (demande/stock/sync) ou si l'opération a
   * été poussée avant la Phase C (poste jamais enregistré).
   */
  posteId: UUID | null;
}
