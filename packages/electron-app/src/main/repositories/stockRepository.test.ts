import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ProduitRepository } from "./produitRepository.js";
import { StockRepository } from "./stockRepository.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "./emplacementRepository.js";

/**
 * Tests réels (vraie base SQLite) de `listTout` — correction "pc annexe
 * ne peut pas vendre malgré le stock réel" (2026-10-27), seule méthode
 * ajoutée à ce dépôt pour cette correction (le reste de StockRepository
 * est déjà couvert par les tests d'intégration existants, voir
 * validationStockDistante.integration.test.ts).
 */

describe("StockRepository.listTout (base réelle)", () => {
  let db: Database.Database;
  let produits: ProduitRepository;
  let stocks: StockRepository;
  let akebe: string;
  let akanda: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    produits = new ProduitRepository(db);
    stocks = new StockRepository(db);
    const emplacements = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacements);
    const depots = emplacements.list().filter((e) => !e.estPointDeVente);
    akebe = depots[0]!.id;
    akanda = depots[1]!.id;
  });

  afterEach(() => {
    db.close();
  });

  it("aucun stock enregistré : tableau vide", () => {
    expect(stocks.listTout()).toEqual([]);
  });

  it("renvoie TOUTES les lignes, tous produits et emplacements confondus", () => {
    const p1 = produits.create({ motif: "A", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "A-60", prix: 1000, seuilAlerte: 1 });
    const p2 = produits.create({ motif: "B", type: "carrelage", taille: "30x30", tailleTri: 900, reference: "B-30", prix: 500, seuilAlerte: 1 });

    stocks.applyDelta({ produitId: p1, emplacementId: akebe, delta: 29 });
    stocks.applyDelta({ produitId: p1, emplacementId: akanda, delta: 4 });
    stocks.applyDelta({ produitId: p2, emplacementId: akebe, delta: 2 });

    const lignes = stocks.listTout();
    expect(lignes).toHaveLength(3);
    expect(lignes).toEqual(
      expect.arrayContaining([
        { produitId: p1, emplacementId: akebe, quantite: 29 },
        { produitId: p1, emplacementId: akanda, quantite: 4 },
        { produitId: p2, emplacementId: akebe, quantite: 2 },
      ])
    );
  });
});

/**
 * Tests réels (vraie base SQLite) de `appliquerValeursAbsolues` —
 * correction "vente sur un poste annexe non répercutée sur le PC Shop
 * après 10+ minutes" (2026-10-27).
 */
describe("StockRepository.appliquerValeursAbsolues (base réelle)", () => {
  let db: Database.Database;
  let produits: ProduitRepository;
  let stocks: StockRepository;
  let akebe: string;
  let akanda: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    produits = new ProduitRepository(db);
    stocks = new StockRepository(db);
    const emplacements = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacements);
    const depots = emplacements.list().filter((e) => !e.estPointDeVente);
    akebe = depots[0]!.id;
    akanda = depots[1]!.id;
  });

  afterEach(() => {
    db.close();
  });

  it("fixe chaque ligne à une valeur ABSOLUE, pas un delta — un stock local existant est écrasé", () => {
    const p1 = produits.create({ motif: "A", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "A-60", prix: 1000, seuilAlerte: 1 });
    stocks.applyDelta({ produitId: p1, emplacementId: akebe, delta: 999 });

    stocks.appliquerValeursAbsolues([{ produitId: p1, emplacementId: akebe, quantite: 13 }]);

    expect(stocks.getQuantite(p1, akebe)).toBe(13);
  });

  it("crée la ligne si elle n'existait pas localement", () => {
    const p1 = produits.create({ motif: "A", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "A-60", prix: 1000, seuilAlerte: 1 });

    stocks.appliquerValeursAbsolues([{ produitId: p1, emplacementId: akanda, quantite: 4 }]);

    expect(stocks.getQuantite(p1, akanda)).toBe(4);
  });

  it("une ligne référençant un produit inconnu localement est ignorée, jamais une exception — les autres lignes valides sont quand même appliquées", () => {
    const p1 = produits.create({ motif: "A", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "A-60", prix: 1000, seuilAlerte: 1 });

    expect(() =>
      stocks.appliquerValeursAbsolues([
        { produitId: "produit-inconnu", emplacementId: akebe, quantite: 50 },
        { produitId: p1, emplacementId: akanda, quantite: 7 },
      ])
    ).not.toThrow();

    expect(stocks.getQuantite(p1, akanda)).toBe(7);
  });
});

/**
 * Fondations quincaillerie (Phase 4) — correction "le bilan additionne
 * des quantités d'unités différentes" (40 cartons + 12 sacs = 52,
 * résultat faux) : ventile le stock par unité de vente réelle du
 * produit, jamais une somme brute entre produits d'unités distinctes.
 */
describe("StockRepository.getQuantitesParUniteParEmplacement — ventilation par unité (base réelle)", () => {
  let db: Database.Database;
  let produits: ProduitRepository;
  let stocks: StockRepository;
  let akebe: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    produits = new ProduitRepository(db);
    stocks = new StockRepository(db);
    const emplacements = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacements);
    akebe = emplacements.list().filter((e) => !e.estPointDeVente)[0]!.id;
  });

  afterEach(() => {
    db.close();
  });

  it("ventile par unité — jamais une somme unique mélangeant carton et sac", () => {
    const pCarton = produits.create({ motif: "Marbre", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "MB-60", prix: 8000, seuilAlerte: 1 });
    const pSac = produits.create({ motif: "Ciment", type: "quincaillerie", taille: "Sac 50kg", tailleTri: 0, reference: "CIM-50", prix: 6500, seuilAlerte: 1, uniteVente: "sac" });

    stocks.applyDelta({ produitId: pCarton, emplacementId: akebe, delta: 40 });
    stocks.applyDelta({ produitId: pSac, emplacementId: akebe, delta: 12 });

    const resultat = stocks.getQuantitesParUniteParEmplacement(akebe);
    expect(resultat).toEqual([
      { unite: "carton", quantite: 40 },
      { unite: "sac", quantite: 12 },
    ]);
  });

  it("un produit sans uniteVente (carreau historique) est regroupé sous 'carton'", () => {
    const p1 = produits.create({ motif: "Marbre", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "MB-60", prix: 8000, seuilAlerte: 1 });
    const p2 = produits.create({ motif: "Grès", type: "carrelage", taille: "30x30", tailleTri: 900, reference: "GR-30", prix: 4000, seuilAlerte: 1 });
    stocks.applyDelta({ produitId: p1, emplacementId: akebe, delta: 10 });
    stocks.applyDelta({ produitId: p2, emplacementId: akebe, delta: 20 });

    expect(stocks.getQuantitesParUniteParEmplacement(akebe)).toEqual([{ unite: "carton", quantite: 30 }]);
  });

  it("aucun stock à cet emplacement → tableau vide, jamais une exception", () => {
    expect(stocks.getQuantitesParUniteParEmplacement(akebe)).toEqual([]);
  });

  it("isole correctement deux emplacements différents", () => {
    const emplacements = new EmplacementRepository(db);
    const akanda = emplacements.list().filter((e) => !e.estPointDeVente)[1]!.id;
    const p1 = produits.create({ motif: "Marbre", type: "carrelage", taille: "60x60", tailleTri: 3600, reference: "MB-60", prix: 8000, seuilAlerte: 1 });

    stocks.applyDelta({ produitId: p1, emplacementId: akebe, delta: 5 });
    stocks.applyDelta({ produitId: p1, emplacementId: akanda, delta: 9 });

    expect(stocks.getQuantitesParUniteParEmplacement(akebe)).toEqual([{ unite: "carton", quantite: 5 }]);
    expect(stocks.getQuantitesParUniteParEmplacement(akanda)).toEqual([{ unite: "carton", quantite: 9 }]);
  });
});
