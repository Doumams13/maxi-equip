import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "../repositories/categorieRepository.js";
import { SousCategorieRepository } from "../repositories/sousCategorieRepository.js";
import { ModeleRepository } from "../repositories/modeleRepository.js";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.7 — diagnostic des doublons
 * potentiels : déclenchement réel du gestionnaire IPC
 * `catalogue:diagnostiquerDoublonsReferentiel`, sur une VRAIE base
 * SQLite (jamais une donnée inventée). Même écart assumé que
 * `metier.referentielSync.test.ts` (mock d'`electron` UNIQUEMENT pour
 * capturer les callbacks `ipcMain.handle`) — toute la couche DONNÉES
 * reste réelle.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (canal: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(canal, fn);
    },
  },
  app: { getPath: () => tmpdir() },
  BrowserWindow: class {},
  dialog: {},
}));

const CHEMIN_DB = join(tmpdir(), "test-metier-diagnostic-doublons.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

interface DiagnosticResultat {
  categories: { nom: string; occurrences: { id: string }[] }[];
  sousCategories: { nom: string; occurrences: { id: string; categorieParenteId: string; categorieParenteNom: string | null }[] }[];
  modeles: { nom: string; occurrences: { id: string; type: string }[] }[];
  produits: { nom: string; occurrences: { id: string; modeleId: string | null; modeleMotif: string | null }[] }[];
}

async function diagnostiquer(): Promise<DiagnosticResultat> {
  const fn = handlers.get("catalogue:diagnostiquerDoublonsReferentiel");
  if (!fn) throw new Error("Canal non enregistré : catalogue:diagnostiquerDoublonsReferentiel");
  return (await fn({})) as DiagnosticResultat;
}

describe("catalogue:diagnostiquerDoublonsReferentiel — Phase 5 (référentiel commun), sous-phase 5.7", () => {
  let db: Database.Database;
  let categorieRepository: CategorieRepository;
  let sousCategorieRepository: SousCategorieRepository;
  let modeleRepository: ModeleRepository;
  let produitRepository: ProduitRepository;
  let boiteEnvoiRepository: BoiteEnvoiRepository;

  beforeEach(async () => {
    handlers.clear();
    db = ouvrirBaseDeTest();
    categorieRepository = new CategorieRepository(db);
    sousCategorieRepository = new SousCategorieRepository(db);
    modeleRepository = new ModeleRepository(db);
    produitRepository = new ProduitRepository(db);
    boiteEnvoiRepository = new BoiteEnvoiRepository(db);

    const sessionManager = { get: () => ({ userId: "testeur" }) };
    const { registerMetierIpcHandlers } = await import("./metier.js");
    registerMetierIpcHandlers(
      produitRepository,
      {} as never, // emplacementRepository
      {} as never, // stockRepository
      {} as never, // mouvementRepository
      {} as never, // factureRepository
      {} as never, // parametresRepository
      boiteEnvoiRepository,
      {} as never, // stockService
      {} as never, // venteService
      {} as never, // imageService
      sessionManager as never,
      modeleRepository,
      undefined, // promotionRepository
      categorieRepository,
      sousCategorieRepository,
      undefined, // sousCategorieChampRepository
      undefined // sousCategorieUniteRepository
    );
  });

  afterEach(() => {
    db.close();
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  // Noms volontairement ABSENTS de CATEGORIES_QUINCAILLERIE_PREDEFINIES
  // (migrate.ts) — "Électricité"/"Plomberie"/"Carrelage et revêtements"
  // etc. sont déjà seedées par `runMigrations` sur CHAQUE base fraîche :
  // les utiliser ici produirait un faux-positif (collision avec la
  // donnée prédéfinie, jamais un vrai doublon entre postes).

  it("1 — deux catégories de même nom, identifiants différents, sont détectées", async () => {
    const id1 = categorieRepository.create({ nom: "Zénithal Test" });
    const id2 = categorieRepository.create({ nom: "Zénithal Test" });

    const resultat = await diagnostiquer();

    expect(resultat.categories).toHaveLength(1);
    expect(resultat.categories[0]!.nom).toBe("Zénithal Test");
    expect(resultat.categories[0]!.occurrences.map((o) => o.id).sort()).toEqual([id1, id2].sort());
  });

  it("2 — deux catégories dont les noms diffèrent uniquement par la casse sont détectées", async () => {
    categorieRepository.create({ nom: "Zénithal Test" });
    categorieRepository.create({ nom: "ZÉNITHAL TEST" });

    const resultat = await diagnostiquer();

    expect(resultat.categories).toHaveLength(1);
    expect(resultat.categories[0]!.occurrences).toHaveLength(2);
  });

  it("3 — deux catégories de noms différents ne sont jamais détectées comme doublons", async () => {
    categorieRepository.create({ nom: "Zénithal Test" });
    categorieRepository.create({ nom: "Floriculture Test" });

    const resultat = await diagnostiquer();

    expect(resultat.categories.some((g) => g.nom === "Zénithal Test" || g.nom === "Floriculture Test")).toBe(false);
  });

  it("4 — deux enregistrements avec le même identifiant ne sont jamais considérés comme des doublons (vérifié au niveau du module pur, non reproductible via les repositories réels qui garantissent l'unicité de l'id)", async () => {
    // Couvert directement dans packages/domain/src/catalogue/index.test.ts
    // (la couche repository ne peut matériellement pas produire deux
    // lignes actives partageant le même id — PRIMARY KEY) ; ici, on
    // vérifie seulement qu'une catégorie seule (un seul id) ne forme
    // jamais un groupe.
    categorieRepository.create({ nom: "Zénithal Test" });
    const resultat = await diagnostiquer();
    expect(resultat.categories.some((g) => g.nom === "Zénithal Test")).toBe(false);
  });

  it("5 — deux sous-catégories de même nom sous la MÊME catégorie parente sont détectées", async () => {
    const catId = categorieRepository.create({ nom: "Vulcanologie Test" });
    const id1 = sousCategorieRepository.create({ categorieId: catId, nom: "Sous-test Alpha" });
    const id2 = sousCategorieRepository.create({ categorieId: catId, nom: "Sous-test Alpha" });

    const resultat = await diagnostiquer();

    const groupe = resultat.sousCategories.find((g) => g.nom === "Sous-test Alpha");
    expect(groupe).toBeDefined();
    expect(groupe!.occurrences.map((o) => o.id).sort()).toEqual([id1, id2].sort());
    expect(groupe!.occurrences[0]!.categorieParenteId).toBe(catId);
    expect(groupe!.occurrences[0]!.categorieParenteNom).toBe("Vulcanologie Test");
  });

  it("6 — deux sous-catégories de même nom sous des catégories DIFFÉRENTES ne sont jamais regroupées", async () => {
    const cat1 = categorieRepository.create({ nom: "Vulcanologie Test" });
    const cat2 = categorieRepository.create({ nom: "Floriculture Test" });
    sousCategorieRepository.create({ categorieId: cat1, nom: "Sous-test Beta" });
    sousCategorieRepository.create({ categorieId: cat2, nom: "Sous-test Beta" });

    const resultat = await diagnostiquer();

    expect(resultat.sousCategories.some((g) => g.nom === "Sous-test Beta")).toBe(false);
  });

  it("7 — deux modèles de même nom (motif), identifiants différents, sont détectés", async () => {
    const id1 = modeleRepository.create({ motif: "Marbre Blanc", type: "Faïence" });
    const id2 = modeleRepository.create({ motif: "Marbre Blanc", type: "Grès cérame" });

    const resultat = await diagnostiquer();

    expect(resultat.modeles).toHaveLength(1);
    expect(resultat.modeles[0]!.nom).toBe("Marbre Blanc");
    expect(resultat.modeles[0]!.occurrences.map((o) => o.id).sort()).toEqual([id1, id2].sort());
  });

  it("deux variantes d'un même modèle (même motif dénormalisé, même modeleId) ne sont JAMAIS un faux-positif — un seul modèle, un seul représentant produit", async () => {
    const modeleId = modeleRepository.create({ motif: "Marbre Blanc", type: "Faïence" });
    produitRepository.create({ modeleId, motif: "Marbre Blanc", type: "Faïence", taille: "60x60", tailleTri: 3600, reference: "MB-6060", prix: 15000, seuilAlerte: 0 });
    produitRepository.create({ modeleId, motif: "Marbre Blanc", type: "Faïence", taille: "30x30", tailleTri: 900, reference: "MB-3030", prix: 8000, seuilAlerte: 0 });

    const resultat = await diagnostiquer();

    expect(resultat.modeles).toEqual([]); // un seul modèle, jamais deux occurrences.
    expect(resultat.produits).toEqual([]); // deux variantes du MÊME modèle, jamais un doublon.
  });

  it("8 — les produits de même nom (motif du modèle parent) sont détectés : un seul produit REPRÉSENTANT par modèle, jamais un par variante — `reference` est structurellement unique (idx_produits_reference_actif) et ne peut donc jamais servir à cette détection", async () => {
    const modeleId1 = modeleRepository.create({ motif: "Marbre Blanc", type: "Faïence" });
    const modeleId2 = modeleRepository.create({ motif: "Marbre Blanc", type: "Grès cérame" });
    produitRepository.create({ modeleId: modeleId1, motif: "Marbre Blanc", type: "Faïence", taille: "60x60", tailleTri: 3600, reference: "MB-A-6060", prix: 15000, seuilAlerte: 0 });
    produitRepository.create({ modeleId: modeleId2, motif: "Marbre Blanc", type: "Grès cérame", taille: "60x60", tailleTri: 3600, reference: "MB-B-6060", prix: 15500, seuilAlerte: 0 });
    // Deuxième variante du modèle 1 — ne doit jamais ajouter une troisième occurrence (un seul représentant par modèle, peu importe lequel des deux produits du modèle 1 est retenu).
    produitRepository.create({ modeleId: modeleId1, motif: "Marbre Blanc", type: "Faïence", taille: "30x30", tailleTri: 900, reference: "MB-A-3030", prix: 8000, seuilAlerte: 0 });

    const resultat = await diagnostiquer();

    expect(resultat.produits).toHaveLength(1);
    expect(resultat.produits[0]!.nom).toBe("Marbre Blanc");
    expect(resultat.produits[0]!.occurrences).toHaveLength(2);
    // Un représentant par modèle : exactement un occurrence par modeleId, peu importe LEQUEL de ses produits a été retenu.
    expect(resultat.produits[0]!.occurrences.map((o) => o.modeleId).sort()).toEqual([modeleId1, modeleId2].sort());
  });

  it("9 — un référentiel sans aucun doublon retourne un résultat vide sur les 4 types (hormis la donnée prédéfinie de la migration, qui ne contient elle-même aucun doublon par construction)", async () => {
    const catId = categorieRepository.create({ nom: "Zénithal Test" });
    sousCategorieRepository.create({ categorieId: catId, nom: "Sous-test Gamma" });
    const modeleId = modeleRepository.create({ motif: "Marbre Blanc Test", type: "Faïence" });
    produitRepository.create({ modeleId, motif: "Marbre Blanc Test", type: "Faïence", taille: "60x60", tailleTri: 3600, reference: "MB-TEST-6060", prix: 15000, seuilAlerte: 0 });

    const resultat = await diagnostiquer();

    expect(resultat).toEqual({ categories: [], sousCategories: [], modeles: [], produits: [] });
  });

  it("10 — l'appel IPC ne modifie jamais la base : aucune ligne ajoutée/modifiée/supprimée, aucun enfilage dans boite_envoi", async () => {
    categorieRepository.create({ nom: "Zénithal Test" });
    categorieRepository.create({ nom: "Zénithal Test" });
    const catCountAvant = categorieRepository.list().length;
    const boiteEnvoiCountAvant = db.prepare("SELECT COUNT(*) as n FROM boite_envoi").get() as { n: number };

    await diagnostiquer();
    await diagnostiquer(); // un second appel, pour vérifier aussi l'idempotence totale (aucun état muté par la lecture elle-même).

    expect(categorieRepository.list().length).toBe(catCountAvant);
    const boiteEnvoiCountApres = db.prepare("SELECT COUNT(*) as n FROM boite_envoi").get() as { n: number };
    expect(boiteEnvoiCountApres.n).toBe(boiteEnvoiCountAvant.n);
  });
});
