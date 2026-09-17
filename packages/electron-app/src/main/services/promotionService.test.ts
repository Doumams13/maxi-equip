import { describe, it, expect, vi } from "vitest";
import type { Promotion } from "@maxi-equip/shared-types";
import { PromotionService, PromotionValidationError, PromotionConflitError } from "./promotionService.js";

/**
 * Tests unitaires du PromotionService — dépôts simulés (pas de SQLite).
 */

const PROMO_BASE: Omit<Promotion, "id" | "createdAt" | "updatedAt"> = {
  libelle: "Soldes été",
  typeReduction: "pourcentage",
  valeur: 20,
  perimetre: "global",
  produitIds: [],
  dateDebut: "2026-06-01T00:00:00.000Z",
  dateFin: "2026-06-30T23:59:59.000Z",
};

const PROMO_COMPLETE: Promotion = {
  ...PROMO_BASE,
  id: "promo-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeRepo(overrides: Partial<ReturnType<typeof makeDefaultRepo>> = {}) {
  return { ...makeDefaultRepo(), ...overrides };
}

function makeDefaultRepo() {
  return {
    list: vi.fn<[], Promotion[]>(() => [PROMO_COMPLETE]),
    listActives: vi.fn<[], Promotion[]>(() => [PROMO_COMPLETE]),
    findById: vi.fn<[string], Promotion | null>((id) => (id === "promo-1" ? PROMO_COMPLETE : null)),
    listActivesParProduit: vi.fn<[], Promotion[]>(() => []),
    compterActives: vi.fn<[], number>(() => 1),
    create: vi.fn<[], string>(() => "promo-new"),
    update: vi.fn(),
    delete: vi.fn(),
    detecterConflit: vi.fn<[], Promotion[]>(() => []),
  };
}

function makeBoiteEnvoiRepo() {
  return {
    creer: vi.fn(() => "envoi-1"),
    listerEnAttente: vi.fn(() => []),
    listerParEntite: vi.fn(() => []),
    findById: vi.fn(() => null),
    marquerEnvoye: vi.fn(),
    marquerConfirme: vi.fn(),
    enregistrerErreur: vi.fn(),
    compterParStatut: vi.fn(() => ({})),
  };
}

function makeDb() {
  return { transaction: vi.fn((cb: () => unknown) => { const exec = () => { return cb(); }; return exec; }) };
}

describe("PromotionService", () => {
  describe("listerToutes", () => {
    it("délègue au repository", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      const result = service.listerToutes();
      expect(repo.list).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
    });
  });

  describe("listerActives", () => {
    it("délègue au repository", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      service.listerActives();
      expect(repo.listActives).toHaveBeenCalledOnce();
    });
  });

  describe("compterActives", () => {
    it("retourne le compteur du repository", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(service.compterActives()).toBe(1);
    });
  });

  describe("creer", () => {
    it("crée une promotion globale valide", () => {
      const boiteEnvoi = makeBoiteEnvoiRepo();
      const promoCreee = { ...PROMO_COMPLETE, id: "promo-new" };
      const repo = makeRepo({ create: vi.fn<[], string>(() => "promo-new"), findById: vi.fn<[string], Promotion | null>(() => promoCreee) });
      const db = { transaction: vi.fn((cb: () => unknown) => { const exec = () => { return cb(); }; return exec; }) };
      const service = new PromotionService(db as never, repo as never, boiteEnvoi as never);
      const result = service.creer(PROMO_BASE);
      expect(repo.create).toHaveBeenCalledOnce();
      expect(boiteEnvoi.creer).toHaveBeenCalledWith("promotion", "promo-new", expect.objectContaining({ operation: "create" }));
      expect(result.id).toBe("promo-new");
    });

    it("refuse un libellé vide", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.creer({ ...PROMO_BASE, libelle: "" })).toThrow(PromotionValidationError);
    });

    it("refuse un libellé trop long (> 100 caractères)", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.creer({ ...PROMO_BASE, libelle: "x".repeat(101) })).toThrow(PromotionValidationError);
    });

    it("refuse une valeur négative", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.creer({ ...PROMO_BASE, valeur: -5 })).toThrow(PromotionValidationError);
    });

    it("refuse un pourcentage > 100", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.creer({ ...PROMO_BASE, typeReduction: "pourcentage", valeur: 101 })).toThrow(PromotionValidationError);
    });

    it("refuse une promotion ciblée sans produits", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() =>
        service.creer({ ...PROMO_BASE, perimetre: "cible", produitIds: [] })
      ).toThrow(PromotionValidationError);
    });

    it("refuse une date de fin antérieure au début", () => {
      const repo = makeRepo();
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() =>
        service.creer({ ...PROMO_BASE, dateDebut: "2026-06-30T00:00:00.000Z", dateFin: "2026-06-01T00:00:00.000Z" })
      ).toThrow(PromotionValidationError);
    });

    it("refuse en cas de conflit de planification", () => {
      const promoConflict = { ...PROMO_COMPLETE, id: "conflit-1" };
      const repo = makeRepo({ detecterConflit: vi.fn<[], Promotion[]>(() => [promoConflict]) });
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.creer(PROMO_BASE)).toThrow(PromotionConflitError);
    });

    it("expose les promotions conflictuelles dans l'erreur", () => {
      const promoConflict = { ...PROMO_COMPLETE, id: "conflit-1" };
      const repo = makeRepo({ detecterConflit: vi.fn<[], Promotion[]>(() => [promoConflict]) });
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      try {
        service.creer(PROMO_BASE);
        expect.fail("Devait lever une exception");
      } catch (err) {
        expect(err).toBeInstanceOf(PromotionConflitError);
        expect((err as PromotionConflitError).conflits).toHaveLength(1);
      }
    });
  });

  describe("modifier", () => {
    it("modifie une promotion existante", () => {
      const boiteEnvoi = makeBoiteEnvoiRepo();
      const promoModifiee = { ...PROMO_COMPLETE, libelle: "Nouveau libellé" };
      const repo = makeRepo({
        findById: vi.fn<[string], Promotion | null>().mockReturnValueOnce(PROMO_COMPLETE).mockReturnValueOnce(promoModifiee),
      });
      const db = { transaction: vi.fn((cb: () => unknown) => { const exec = () => { return cb(); }; return exec; }) };
      const service = new PromotionService(db as never, repo as never, boiteEnvoi as never);
      const result = service.modifier("promo-1", { libelle: "Nouveau libellé" });
      expect(repo.update).toHaveBeenCalledOnce();
      expect(result.libelle).toBe("Nouveau libellé");
    });

    it("refuse de modifier une promotion introuvable", () => {
      const repo = makeRepo({ findById: vi.fn<[string], Promotion | null>(() => null) });
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.modifier("inexistant", { libelle: "X" })).toThrow(PromotionValidationError);
    });
  });

  describe("supprimer", () => {
    it("supprime une promotion existante", () => {
      const boiteEnvoi = makeBoiteEnvoiRepo();
      const repo = makeRepo();
      const db = { transaction: vi.fn((cb: () => unknown) => { const exec = () => { return cb(); }; return exec; }) };
      const service = new PromotionService(db as never, repo as never, boiteEnvoi as never);
      service.supprimer("promo-1");
      expect(repo.delete).toHaveBeenCalledWith("promo-1");
      expect(boiteEnvoi.creer).toHaveBeenCalledWith("promotion", "promo-1", expect.objectContaining({ operation: "delete" }));
    });

    it("refuse de supprimer une promotion introuvable", () => {
      const repo = makeRepo({ findById: vi.fn<[string], Promotion | null>(() => null) });
      const service = new PromotionService(makeDb() as never, repo as never, makeBoiteEnvoiRepo() as never);
      expect(() => service.supprimer("inexistant")).toThrow(PromotionValidationError);
    });
  });
});
