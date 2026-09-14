import type { Demande, DemandeStatut } from "@maxi-equip/shared-types";
import { DemandeRepository, type NouvelleDemande } from "../repositories/demandeRepository.js";
import { NotificationRepository } from "../repositories/notificationRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";

/**
 * Correction "Workflow réel des demandes" — orchestre le cycle de vie
 * d'une demande du site vitrine SANS jamais dupliquer la logique de
 * vente : `VenteService` n'est plus une dépendance de ce service du
 * tout (contrairement à la première version de la Phase 4.1) — la
 * demande sert uniquement de SOURCE DE DONNÉES pour préremplir l'écran
 * Vente réel (voir `VentesScreen.tsx`), qui appelle lui-même
 * `ventes:create` exactement comme pour n'importe quelle vente. Une
 * fois la vente réellement validée là-bas, `marquerTraitee()` se
 * contente d'enregistrer la liaison — jamais une seconde création de
 * vente/facture/mouvement ici.
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

export interface EntreeSuiviDemande {
  statut: DemandeStatut;
  commentaire: string | null;
  createdAt: string;
}

export const DUREE_CONSERVATION_DEMANDE_NON_CONFIRMEE_MS = 7 * 24 * 60 * 60 * 1000;

const STATUTS_SUIVI: DemandeStatut[] = ["nouvelle", "en_cours", "a_contacter"];
const STATUTS_MODIFIABLES: DemandeStatut[] = ["nouvelle", "en_cours", "a_contacter", "contactee"];

export class DemandeService {
  constructor(
    private readonly demandeRepository: DemandeRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly stockRepository: StockRepository
  ) {}

  creerDepuisReception(input: NouvelleDemande): Demande {
    if (input.sourceEntityId) {
      const existante = this.demandeRepository.trouverParSourceEntityId(input.sourceEntityId);
      if (existante) return existante;
    }

    const demande = this.demandeRepository.creer(input);
    this.demandeRepository.ajouterSuivi(demande.id, "nouvelle", "Demande reçue depuis le site.");
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

  listerSuivi(demandeId: string): EntreeSuiviDemande[] {
    return this.demandeRepository.listerSuivi(demandeId);
  }

  compterActives(): number {
    return this.demandeRepository.compterActives();
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

  marquerSuivi(demandeId: string, statut: DemandeStatut, commentaire: string | null = null): Demande {
    if (!STATUTS_SUIVI.includes(statut)) {
      throw new DemandeValidationError(`"${statut}" n'est pas un statut de suivi valide.`);
    }
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    this.demandeRepository.changerStatut(demandeId, statut);
    this.demandeRepository.ajouterSuivi(demandeId, statut, commentaire?.trim() || null);
    return this.demandeRepository.findById(demandeId)!;
  }

  marquerTraitee(demandeId: string, factureId: string): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    if (demande.statut === "confirmee") throw new DemandeValidationError("Cette demande est déjà traitée.");
    if (demande.statut === "refusee" || demande.statut === "annulee") {
      throw new DemandeValidationError(`Une demande ${demande.statut === "refusee" ? "refusée" : "annulée"} ne peut plus être traitée.`);
    }
    this.demandeRepository.marquerConfirmee(demandeId, factureId);
    this.demandeRepository.ajouterSuivi(demandeId, "confirmee", "Vente validée — facture liée.");
    return this.demandeRepository.findById(demandeId)!;
  }

  refuser(demandeId: string, motif: string): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    if (!motif.trim()) throw new DemandeValidationError("Un motif est obligatoire pour refuser une demande.");
    this.demandeRepository.refuser(demandeId, motif.trim());
    this.demandeRepository.ajouterSuivi(demandeId, "refusee", motif.trim());
    return this.demandeRepository.findById(demandeId)!;
  }

  annuler(demandeId: string): Demande {
    const demande = this.demandeRepository.findById(demandeId);
    if (!demande) throw new DemandeValidationError("Demande introuvable.");
    this.assurerModifiable(demande);
    this.demandeRepository.changerStatut(demandeId, "annulee");
    this.demandeRepository.ajouterSuivi(demandeId, "annulee", null);
    return this.demandeRepository.findById(demandeId)!;
  }

  purgerDemandesAnciennes(): string[] {
    return this.demandeRepository.purgerDemandesNonConfirmeesAvant(DUREE_CONSERVATION_DEMANDE_NON_CONFIRMEE_MS);
  }
}
