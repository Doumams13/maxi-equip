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

export type NotificationType = "demande" | "stock" | "sync";

export interface Notification extends MetierEntity {
  type: NotificationType;
  titre: string;
  message: string;
  lue: boolean;
  /** Permet l'ouverture directe de la demande concernée au clic (§8). */
  demandeId: UUID | null;
}
