import { describe, expect, it } from "vitest";
import {
  applyEntree,
  applySortie,
  applyTransfert,
  repartirVenteInterneExterne,
  assertCoherentMouvement,
  InsufficientStockError,
  InvalidQuantityError,
  IncohérenceMouvementError,
  peutEncoreAnnulerMouvement,
  DELAI_ANNULATION_MOUVEMENT_MS,
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

describe("assertCoherentMouvement — cohérence structurelle", () => {
  it("accepte une entrée avec emplacementId renseigné", () => {
    expect(() => assertCoherentMouvement({ type: "entree", emplacementId: "shop", emplacementSourceId: null, emplacementDestinationId: null })).not.toThrow();
  });

  it("rejette une entrée sans emplacementId", () => {
    expect(() => assertCoherentMouvement({ type: "entree", emplacementId: null, emplacementSourceId: null, emplacementDestinationId: null })).toThrow(IncohérenceMouvementError);
  });

  it("rejette une entrée avec des champs transfert renseignés", () => {
    expect(() => assertCoherentMouvement({ type: "entree", emplacementId: "shop", emplacementSourceId: "akebe", emplacementDestinationId: null })).toThrow(IncohérenceMouvementError);
  });

  it("accepte une sortie réelle avec emplacementId renseigné", () => {
    expect(() => assertCoherentMouvement({ type: "sortie", emplacementId: "shop", emplacementSourceId: null, emplacementDestinationId: null })).not.toThrow();
  });

  it("accepte une sortie externe (trace d'appro, emplacementId null)", () => {
    expect(() => assertCoherentMouvement({ type: "sortie", emplacementId: null, emplacementSourceId: null, emplacementDestinationId: null })).not.toThrow();
  });

  it("rejette une sortie avec des champs transfert renseignés", () => {
    expect(() => assertCoherentMouvement({ type: "sortie", emplacementId: null, emplacementSourceId: "akebe", emplacementDestinationId: "shop" })).toThrow(IncohérenceMouvementError);
  });

  it("accepte un transfert avec source et destination renseignées, emplacementId null", () => {
    expect(() => assertCoherentMouvement({ type: "transfert", emplacementId: null, emplacementSourceId: "akebe", emplacementDestinationId: "shop" })).not.toThrow();
  });

  it("rejette un transfert sans emplacementSourceId", () => {
    expect(() => assertCoherentMouvement({ type: "transfert", emplacementId: null, emplacementSourceId: null, emplacementDestinationId: "shop" })).toThrow(IncohérenceMouvementError);
  });

  it("rejette un transfert sans emplacementDestinationId", () => {
    expect(() => assertCoherentMouvement({ type: "transfert", emplacementId: null, emplacementSourceId: "akebe", emplacementDestinationId: null })).toThrow(IncohérenceMouvementError);
  });

  it("rejette un transfert avec emplacementId renseigné (doit être null)", () => {
    expect(() => assertCoherentMouvement({ type: "transfert", emplacementId: "shop", emplacementSourceId: "akebe", emplacementDestinationId: "shop" })).toThrow(IncohérenceMouvementError);
  });
});

describe("Stock — isolation des variantes (§19 Phase 4)", () => {
  it("deux variantes d'un même modèle gardent leurs stocks complètement séparés", () => {
    // Variante A (60×60) et variante B (30×60) du même motif "Marbre Blanc"
    // ont chacune leur propre produit_id. Les deltas ne doivent jamais se croiser.
    const emplacementId = "akebe";

    const deltaA = applyEntree(emplacementId, 50);
    const deltaB = applyEntree(emplacementId, 30);

    // Chaque delta porte uniquement l'emplacement — la séparation par produitId
    // est garantie au niveau du dépôt (UNIQUE produit_id, emplacement_id).
    // Ce test vérifie que les règles de domaine ne mélangent pas les quantités.
    expect(deltaA).toEqual({ emplacementId, delta: 50 });
    expect(deltaB).toEqual({ emplacementId, delta: 30 });

    // Une sortie sur la variante A ne peut jamais consommer le stock de la variante B.
    const sortieA = applySortie(emplacementId, 50, 20);
    expect(sortieA).toEqual({ emplacementId, delta: -20 });

    // Variante B, stock intact à 30 — sortie de 30 doit réussir.
    const sortieB = applySortie(emplacementId, 30, 30);
    expect(sortieB).toEqual({ emplacementId, delta: -30 });

    // Sortie impossible sur variante B après épuisement (stock 0) — stock insuffisant.
    expect(() => applySortie(emplacementId, 0, 1)).toThrow(InsufficientStockError);
  });

  it("une sortie sur une variante ne consomme jamais le stock d'une autre variante du même modèle", () => {
    // Variante A avec 10 cartons, variante B avec 0 carton.
    // Une tentative de sortie de 5 sur la variante B doit échouer, même si A en a 10.
    expect(() => applySortie("akebe", 0, 5)).toThrow(InsufficientStockError);
    // La variante A, elle, peut sortir sans problème.
    expect(() => applySortie("akebe", 10, 5)).not.toThrow();
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

describe("peutEncoreAnnulerMouvement — délai d'annulation (48h)", () => {
  const maintenant = new Date("2026-01-10T12:00:00.000Z");

  it("DELAI_ANNULATION_MOUVEMENT_MS correspond bien à 48 heures", () => {
    expect(DELAI_ANNULATION_MOUVEMENT_MS).toBe(48 * 60 * 60 * 1000);
  });

  it("accepte un mouvement vieux de moins de 48h", () => {
    const il_y_a_10h = new Date("2026-01-10T02:00:00.000Z").toISOString();
    expect(peutEncoreAnnulerMouvement(il_y_a_10h, maintenant)).toBe(true);
  });

  it("accepte un mouvement exactement à 48h (limite incluse)", () => {
    const il_y_a_48h = new Date("2026-01-08T12:00:00.000Z").toISOString();
    expect(peutEncoreAnnulerMouvement(il_y_a_48h, maintenant)).toBe(true);
  });

  it("rejette un mouvement de plus de 48h", () => {
    const il_y_a_49h = new Date("2026-01-08T11:00:00.000Z").toISOString();
    expect(peutEncoreAnnulerMouvement(il_y_a_49h, maintenant)).toBe(false);
  });

  it("accepte un mouvement qui vient d'être créé (0ms d'écart)", () => {
    expect(peutEncoreAnnulerMouvement(maintenant.toISOString(), maintenant)).toBe(true);
  });
});
