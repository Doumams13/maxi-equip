import { describe, expect, it } from "vitest";
import {
  applyEntree,
  applySortie,
  applyTransfert,
  repartirVenteInterneExterne,
  InsufficientStockError,
  InvalidQuantityError,
} from "./index.js";

describe("Stock — entrée", () => {
  it("augmente le stock de l'emplacement concerné", () => {
    const delta = applyEntree("shop", 50);
    expect(delta).toEqual({ emplacementId: "shop", delta: 50 });
  });

  it("rejette une quantité nulle ou négative", () => {
    expect(() => applyEntree("shop", 0)).toThrow(InvalidQuantityError);
    expect(() => applyEntree("shop", -5)).toThrow(InvalidQuantityError);
  });
});

describe("Stock — sortie", () => {
  it("accepte une sortie valide (quantité disponible suffisante)", () => {
    const delta = applySortie("shop", 20, 15);
    expect(delta).toEqual({ emplacementId: "shop", delta: -15 });
  });

  it("refuse une sortie supérieure au stock disponible", () => {
    expect(() => applySortie("shop", 10, 15)).toThrow(InsufficientStockError);
  });

  it("le message d'erreur mentionne les quantités demandée et disponible", () => {
    try {
      applySortie("shop", 10, 15);
      throw new Error("aurait dû lever InsufficientStockError");
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect((err as InsufficientStockError).available).toBe(10);
      expect((err as InsufficientStockError).requested).toBe(15);
    }
  });
});

describe("Stock — transfert", () => {
  it("produit un delta négatif à la source et positif à la destination", () => {
    const [source, destination] = applyTransfert("akebe", "shop", 30, 10);
    expect(source).toEqual({ emplacementId: "akebe", delta: -10 });
    expect(destination).toEqual({ emplacementId: "shop", delta: 10 });
  });

  it("refuse un transfert dont la source et la destination sont identiques", () => {
    expect(() => applyTransfert("shop", "shop", 30, 10)).toThrow(InvalidQuantityError);
  });

  it("refuse un transfert dépassant le stock disponible à la source", () => {
    expect(() => applyTransfert("akebe", "shop", 5, 10)).toThrow(InsufficientStockError);
  });
});

describe("Stock — répartition interne / externe (§7, règle critique)", () => {
  it("couvre entièrement la demande par le stock interne si suffisant", () => {
    const result = repartirVenteInterneExterne("shop", 30, 20);
    expect(result).toEqual({
      quantiteInterne: 20,
      quantiteExterne: 0,
      stockDelta: { emplacementId: "shop", delta: -20 },
    });
  });

  it("répartit correctement quand le stock ne couvre qu'une partie (cas du cahier des charges : 20 internes + 10 externes)", () => {
    const result = repartirVenteInterneExterne("shop", 20, 30);
    expect(result.quantiteInterne).toBe(20);
    expect(result.quantiteExterne).toBe(10);
    expect(result.stockDelta).toEqual({ emplacementId: "shop", delta: -20 });
  });

  it("RÈGLE CRITIQUE : la quantité externe ne génère jamais de delta de stock, même indirectement", () => {
    const result = repartirVenteInterneExterne("shop", 20, 30);
    // Le delta ne doit porter QUE sur la part interne (-20), jamais sur les 30
    // demandés ni sur la part externe (10) — vérifié explicitement ici.
    expect(result.stockDelta?.delta).toBe(-20);
    expect(result.stockDelta?.delta).not.toBe(-30);
  });

  it("gère le cas 100% externe (aucun stock disponible)", () => {
    const result = repartirVenteInterneExterne("shop", 0, 10);
    expect(result.quantiteInterne).toBe(0);
    expect(result.quantiteExterne).toBe(10);
    expect(result.stockDelta).toBeNull();
  });
});
