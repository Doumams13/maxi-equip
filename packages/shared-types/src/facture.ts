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
  /** Somme des lignes, AVANT remise — jamais modifié par la remise (reste la base du calcul du CA/dashboard, voir factureRepository.sommeTotal). */
  total: number;
  /**
   * Remise commerciale exceptionnelle sur CETTE vente, en FCFA — jamais
   * un pourcentage, jamais lié au catalogue. Distincte d'une promotion
   * (prix catalogue avec période, voir Promotion) : la remise ne modifie
   * jamais `total` ni le prix catalogue des produits, uniquement ce que
   * le client paie réellement (`total - remise`, voir Total Net à payer
   * sur la facture). `0` par défaut — jamais `null`, une remise absente
   * est une remise nulle, pas une donnée manquante.
   */
  remise: number;

  /** Mode de règlement, saisi lors de la vente — figure sur le document facture (correction "Facturation" §21). */
  modeReglement: string | null;

  /**
   * Statut de paiement (correction "Réservation / Acompte") — distinct du
   * statut de livraison ci-dessous. "reservation" = un acompte a été versé
   * mais `montantPaye` < total net ; "payee" = montant intégralement réglé
   * (`montantPaye` === total net). TOUJOURS renseigné — jamais de statut
   * "non payée" : même une réservation correspond à un paiement réel
   * (l'acompte), §13 de la correction reste vrai. `"payee"` par défaut
   * pour toute facture créée avant cette évolution (jamais reconstruit
   * rétroactivement).
   */
  statutPaiement: "reservation" | "payee";
  /**
   * Montant réellement encaissé à ce jour, en FCFA — jamais `null`. Égal
   * au total net (`total - remise`) quand `statutPaiement === "payee"` ;
   * strictement inférieur quand `"reservation"` (c'est l'acompte versé).
   * Voir `calculerSoldeRestant` (domain/invoicing) pour le solde restant,
   * jamais stocké séparément (évite toute désynchronisation).
   */
  montantPaye: number;

  /**
   * Statut de livraison — indépendant du statut de paiement. Modifiable
   * librement dans les deux sens depuis l'écran Factures (aucun statut
   * "terminus" verrouillé — décision explicite, correction "Réservation /
   * Acompte").
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

  /**
   * Correction Phase Finale, Bloc 6 — instantané de l'identité
   * entreprise capturé au moment de la vente. Une facture historique ne
   * doit JAMAIS changer d'apparence si les paramètres entreprise sont
   * modifiés après coup (nouveau nom, nouvelle adresse...) — voir
   * venteService.ts (capture) et factureDocumentService.ts (lecture).
   * `null` uniquement pour les factures émises AVANT cette évolution
   * (jamais reconstruit rétroactivement) — le document retombe alors sur
   * l'identité courante, seul comportement raisonnable pour ces
   * factures antérieures.
   */
  identiteSnapshot: IdentiteEntrepriseSnapshot | null;
}

/** Sous-ensemble de l'identité entreprise réellement affiché sur un document (facture/relevé interne) — voir Facture.identiteSnapshot. */
export interface IdentiteEntrepriseSnapshot {
  nom: string;
  adresse: string;
  quartier: string;
  telephones: string[];
  nomAdministrateur: string | null;
  nomGerant: string | null;
}

export interface LigneFacture {
  produitId: UUID | null;
  motif: string;
  /** Référence du produit au moment de la vente — snapshot, même principe que motif/taille (jamais une jointure live vers produits, qui pourrait avoir changé ou été supprimé depuis). `null` uniquement pour une vente enregistrée avant l'ajout de ce champ — jamais une valeur inventée pour ces lignes historiques. */
  reference: string | null;
  taille: string;
  quantite: number;
  /** Prix appliqué à CETTE vente — prix promo si une promotion était active, sinon prix catalogue (§6). */
  prixUnitaire: number;
  /** Prix catalogue au moment de la vente — renseigné uniquement si une promotion était active (barré sur la facture). */
  prixUnitaireNormal: number | null;
  /** Identifiant de la promotion appliquée — null si aucune promotion. */
  promotionId: string | null;
  /** Libellé de la promotion — conservé même si la promotion est supprimée ultérieurement. */
  promotionLibelle: string | null;
  /** Type de réduction appliquée — "pourcentage" ou "montant_fixe". */
  promotionType: string | null;
  /** Valeur de la réduction au moment de la vente. */
  promotionValeur: number | null;
  /**
   * Surface d'un carton de ce produit, en m², au moment de la vente —
   * snapshot (même principe que reference/taille : jamais recalculé
   * depuis le produit actuel, qui a pu changer depuis). Permet d'afficher
   * un prix au m² sur la facture cohérent avec le prix de carton
   * réellement facturé, même négocié (voir domain/pricing/surfaceCarton.ts).
   * `null` si l'information n'était pas disponible au moment de la vente
   * (carreauxParCarton ou dimensions non renseignés) — jamais une valeur
   * inventée.
   */
  surfaceCartonM2: number | null;
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
