import type { ISODateTime, MetierEntity, UUID } from "./common.js";

/**
 * Facture client. Cahier des charges §7 et §11 — RÈGLE CRITIQUE :
 * cette forme ne contient JAMAIS de champ relatif à l'origine externe
 * d'un approvisionnement (fournisseur, coût d'achat). Si un produit
 * provient en partie du stock et en partie d'une source externe, la
 * facture affiche UNE SEULE ligne fusionnée (30 cartons), sans distinction
 * visible. Le détail de la répartition vit exclusivement dans
 * ReleveInterneApprovisionnement, une entité séparée (voir plus bas).
 *
 * Une facture n'existe qu'après confirmation de la vente (§6) — il n'y a
 * pas de "facture brouillon" persistée.
 */
export interface Facture extends MetierEntity {
  numero: string;
  date: ISODateTime;
  emplacementId: UUID;

  clientNom: string;
  clientTelephone: string | null;
  clientAdresse: string | null;

  /**
   * Vendeur = compte connecté au moment de la confirmation, par défaut.
   * `vendeurNomManuel` est un champ optionnel permettant de préciser qui
   * est réellement à l'origine de la vente lorsque ce n'est pas le compte
   * utilisé pour l'enregistrer (Corrections §7).
   */
  vendeurUtilisateurId: UUID;
  vendeurNomManuel: string | null;

  lignes: LigneFacture[];
  total: number;

  /** Mode de règlement, saisi lors de la vente — figure sur le document facture (correction "Facturation" §21). */
  modeReglement: string | null;

  /**
   * Statut de livraison — JAMAIS de statut "non payée" : une facture
   * n'existe qu'une fois le paiement confirmé (§13 de la correction).
   */
  statutLivraison: "en_attente" | "livree";
  livreeLe: ISODateTime | null;

  /**
   * Annulation (suppression douce, §5/§6/§21) — la facture disparaît des
   * factures actives mais reste tracée : jamais une perte de donnée.
   */
  annuleeLe: ISODateTime | null;
  annuleePar: UUID | null;
  motifAnnulation: string | null;

  /**
   * Renseigné UNIQUEMENT sur une facture annulée, une fois qu'elle a
   * servi de base à une correction — empêche de proposer une seconde
   * correction à partir de la même erreur déjà traitée.
   */
  corrigeeParFactureId: UUID | null;
}

export interface LigneFacture {
  produitId: UUID | null;
  motif: string;
  taille: string;
  quantite: number;
  /** Prix appliqué à CETTE vente — peut différer du prix catalogue (§6). */
  prixUnitaire: number;
}

/**
 * Relevé interne d'approvisionnement — document strictement séparé de la
 * facture, jamais transmis au client. Cahier des charges §7 et §11.
 */
export interface ReleveInterneApprovisionnement extends MetierEntity {
  factureId: UUID;
  lignes: LigneReleveInterne[];
}

export interface LigneReleveInterne {
  motif: string;
  taille: string;
  quantite: number;
  fournisseur: string;
  prixAchat: number;
  prixVente: number;
}
