import type { Demande, DemandeStatut } from "@maxi-equip/shared-types";
import { DemandeRepository, type NouvelleDemande, type NouvelleLigneDemande } from "../repositories/demandeRepository.js";
import { NotificationRepository } from "../repositories/notificationRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { VenteService, type VenteLigneInput, type VenteResult } from "./venteService.js";

/**
 * Phase 4.1 — orchestre le cycle de vie d'une demande du site vitrine.
 * Partie 10, point le plus important : la confirmation réutilise
 * EXACTEMENT `VenteService.enregistrerVente()` déjà existant et déjà
 * testé (Phase 2) — aucune règle de stock, de sourcing ou de calcul de
 * facture n'est réimplémentée ici.
 */

export class DemandeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemandeValidationError";
  }
}

export interface LigneVerificationStock {
  produitId: string;
  motif: string;
  taille: string;
  quantiteDemandee: number;
  quantiteDisponible: number;
}

export interface ConfirmerDemandeInput {
  pointDeVenteId: string;
  vendeurUtilisateurId: string;
  vendeurCompteConnecteNom: string;
  vendeurNomManuel: string | null;
  modeReglement: string | null;
  lignes: VenteLigneInput[];
}

export const DUREE_CONSERVATION_DEMANDE_NON_CONFIRMEE_MS = 7 * 24 * 60 * 60 * 1000;

const STATUTS_MODIFIABLES: DemandeStatut[] = ["nouvelle", "en_cours", "a_contacter", "contactee"];

export class DemandeService {
  constructor(
    private readonly demandeRepository: DemandeRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly stockRepository: StockRepository,
    private readonly venteService: VenteService
  ) {}

  /**
   * Partie 17 : si `sourceEntityId` est fourni et correspond à une
   * demande déjà créée (une synchronisation qui recouvrirait la même
   * opération), ne crée jamais de doublon métier — renvoie la demande
   * existante telle quelle, sans nouvelle notification.
   */
  creerDepuisReception(input: NouvelleDemande): Demande {
    if (input.sourceEntityId) {
      const existante = this.demandeRepository.trouverParSourceEntityId(input.sourceEntityId);
      if (existante) return existante;
    }

    const demande = this.demandeRepository.creer(input);
    const nombreArticles = demande.lignes.reduce((s, l) => s + l.quantite, 0);
    this.notificationRepository.creer(
      "demande",
      "Nouvelle demande",
      `${demande.clientNom} — ${nombreArticles} article(s) — ${demande.numero}`,
      demande.id
    );
    return demande;
  }

  listerToutes(): Demande[] {
    return this.demandeRepository.listerToutes();
  }

  obtenir(id: string): Demande | null {
    return this.demandeRepository.findById(id);
  }

  private assurerModifiable(demande: Demande): void {
    if (!STATUTS_MODIFIABLES.includes(demande.statut)) {
      throw new DemandeValidationError(`Une demande au statut "${demande.statut}" ne peut plus être modifiée.`);
    }
  }

  verifierStock(demandeId: string): LigneVerificationStock[] {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    const totaux = this.stockRepository.getTotalsForProduits(demande.lignes.map((l) => l.produitId));
    return demande.lignes.map((l) => ({
      produitId: l.produitId,
      motif: l.motif,
      taille: l.taille,
      quantiteDemandee: l.quantite,
      quantiteDisponible: totaux.get(l.produitId) ?? 0,
    }));
  }

  modifierLignes(demandeId: string, lignes: NouvelleLigneDemande[]): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    if (lignes.length === 0) throw new DemandeValidationError("Une demande doit conserver au moins un produit.");
    this.demandeRepository.remplacerLignes(demandeId, lignes);
    return this.demandeRepository.findById(demandeId)!;
  }

  modifierClient(
    demandeId: string,
    champs: { clientNom?: string; clientTelephone?: string; clientAdresse?: string; clientEmail?: string | null; commentaire?: string | null }
  ): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    this.demandeRepository.modifierClient(demandeId, champs);
    return this.demandeRepository.findById(demandeId)!;
  }

  confirmer(demandeId: string, input: ConfirmerDemandeInput): VenteResult {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    if (demande.statut === "confirmee") throw new DemandeValidationError("Cette demande est déjà confirmée.");
    if (demande.statut === "refusee" || demande.statut === "annulee") {
      throw new DemandeValidationError(`Une demande ${demande.statut === "refusee" ? "refusée" : "annulée"} ne peut plus être confirmée.`);
    }

    const result = this.venteService.enregistrerVente({
      pointDeVenteId: input.pointDeVenteId,
      clientNom: demande.clientNom,
      clientTelephone: demande.clientTelephone,
      clientAdresse: demande.clientAdresse,
      vendeurUtilisateurId: input.vendeurUtilisateurId,
      vendeurCompteConnecteNom: input.vendeurCompteConnecteNom,
      vendeurNomManuel: input.vendeurNomManuel,
      modeReglement: input.modeReglement,
      lignes: input.lignes,
    });

    this.demandeRepository.marquerConfirmee(demandeId, result.factureId);
    return result;
  }

  refuser(demandeId: string, motif: string): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    if (!motif.trim()) throw new DemandeValidationError("Un motif est obligatoire pour refuser une demande.");
    this.demandeRepository.refuser(demandeId, motif.trim());
    return this.demandeRepository.findById(demandeId)!;
  }

  annuler(demandeId: string): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    this.demandeRepository.changerStatut(demandeId, "annulee");
    return this.demandeRepository.findById(demandeId)!;
  }

  purgerDemandesAnciennes(): string[] {
    return this.demandeRepository.purgerDemandesNonConfirmeesAvant(DUREE_CONSERVATION_DEMANDE_NON_CONFIRMEE_MS);
  }
}
