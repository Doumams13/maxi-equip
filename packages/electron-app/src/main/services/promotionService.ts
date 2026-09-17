import type { Promotion } from "@maxi-equip/shared-types";
import { pricing as domainPricing } from "@maxi-equip/domain";
import { PromotionRepository } from "../repositories/promotionRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";

export class PromotionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionValidationError";
  }
}

export class PromotionConflitError extends Error {
  /** Promotions existantes qui entrent en conflit avec la nouvelle. */
  readonly conflits: Promotion[];
  constructor(message: string, conflits: Promotion[]) {
    super(message);
    this.name = "PromotionConflitError";
    this.conflits = conflits;
  }
}

export class PromotionService {
  constructor(
    private readonly db: import("better-sqlite3-multiple-ciphers").Database,
    private readonly promotionRepository: PromotionRepository,
    private readonly boiteEnvoiRepository: BoiteEnvoiRepository
  ) {}

  listerToutes(): Promotion[] {
    return this.promotionRepository.list();
  }

  listerActives(): Promotion[] {
    return this.promotionRepository.listActives();
  }

  compterActives(): number {
    return this.promotionRepository.compterActives();
  }

  obtenir(id: string): Promotion | null {
    return this.promotionRepository.findById(id);
  }

  creer(input: Omit<Promotion, "id" | "createdAt" | "updatedAt">): Promotion {
    this.valider(input);

    const conflits = this.promotionRepository.detecterConflit({
      perimetre: input.perimetre,
      produitIds: input.produitIds,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
    });
    if (conflits.length > 0) {
      throw new PromotionConflitError(
        `Conflit de planification : ${conflits.length} promotion(s) existante(s) couvrent déjà cette période pour les mêmes produits.`,
        conflits
      );
    }

    const executer = this.db.transaction(() => {
      const id = this.promotionRepository.create(input);
      const promo = this.promotionRepository.findById(id)!;
      this.boiteEnvoiRepository.creer("promotion", id, {
        operation: "create",
        promotionId: id,
        libelle: input.libelle,
        typeReduction: input.typeReduction,
        valeur: input.valeur,
        perimetre: input.perimetre,
        produitIds: input.produitIds,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin,
      });
      return promo;
    });

    return executer();
  }

  modifier(id: string, input: Partial<Omit<Promotion, "id" | "createdAt" | "updatedAt">>): Promotion {
    const existante = this.promotionRepository.findById(id);
    if (!existante) {
      throw new PromotionValidationError("Promotion introuvable.");
    }

    const merged = {
      libelle: input.libelle ?? existante.libelle,
      typeReduction: input.typeReduction ?? existante.typeReduction,
      valeur: input.valeur ?? existante.valeur,
      perimetre: input.perimetre ?? existante.perimetre,
      produitIds: input.produitIds ?? existante.produitIds,
      dateDebut: input.dateDebut ?? existante.dateDebut,
      dateFin: input.dateFin ?? existante.dateFin,
    };

    this.valider(merged);

    const conflits = this.promotionRepository.detecterConflit({
      perimetre: merged.perimetre,
      produitIds: merged.produitIds,
      dateDebut: merged.dateDebut,
      dateFin: merged.dateFin,
      excludeId: id,
    });
    if (conflits.length > 0) {
      throw new PromotionConflitError(
        `Conflit de planification : ${conflits.length} promotion(s) existante(s) couvrent déjà cette période pour les mêmes produits.`,
        conflits
      );
    }

    const executer = this.db.transaction(() => {
      this.promotionRepository.update(id, input);
      const promo = this.promotionRepository.findById(id)!;
      this.boiteEnvoiRepository.creer("promotion", id, {
        operation: "update",
        promotionId: id,
        ...merged,
      });
      return promo;
    });

    return executer();
  }

  supprimer(id: string): void {
    const existante = this.promotionRepository.findById(id);
    if (!existante) {
      throw new PromotionValidationError("Promotion introuvable.");
    }

    const executer = this.db.transaction(() => {
      this.promotionRepository.delete(id);
      this.boiteEnvoiRepository.creer("promotion", id, {
        operation: "delete",
        promotionId: id,
      });
    });

    executer();
  }

  private valider(input: Pick<Promotion, "libelle" | "typeReduction" | "valeur" | "perimetre" | "produitIds" | "dateDebut" | "dateFin">): void {
    if (!input.libelle || input.libelle.trim().length === 0) {
      throw new PromotionValidationError("Le libellé de la promotion est obligatoire.");
    }
    if (input.libelle.trim().length > 100) {
      throw new PromotionValidationError("Le libellé ne peut pas dépasser 100 caractères.");
    }
    if (input.perimetre === "cible" && input.produitIds.length === 0) {
      throw new PromotionValidationError("Une promotion ciblée doit sélectionner au moins un produit.");
    }
    try {
      domainPricing.assertValidPromotion({
        typeReduction: input.typeReduction,
        valeur: input.valeur,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin,
      });
    } catch (err) {
      throw new PromotionValidationError(err instanceof Error ? err.message : String(err));
    }
  }
}
