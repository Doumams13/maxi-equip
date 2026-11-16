import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "./categorieRepository.js";
import { SousCategorieRepository } from "./sousCategorieRepository.js";
import { SousCategorieUniteRepository } from "./sousCategorieUniteRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-sous-categorie-unite-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("SousCategorieUniteRepository — fondations quincaillerie (Phase 3 bis), base réelle", () => {
  let db: Database.Database;
  let unites: SousCategorieUniteRepository;
  let sousCatTuyaux: string;
  let sousCatCables: string;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    const categories = new CategorieRepository(db);
    const sousCategories = new SousCategorieRepository(db);
    unites = new SousCategorieUniteRepository(db);
    const catPlomberie = categories.create({ nom: "Plomberie et évacuation" });
    sousCatTuyaux = sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux" });
    const catElec = categories.create({ nom: "Électricité" });
    sousCatCables = sousCategories.create({ categorieId: catElec, nom: "Câbles" });
  });

  afterEach(() => {
    db.close();
  });
  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("une sous-catégorie jamais configurée renvoie configuree:false et une liste vide", () => {
    expect(unites.obtenirConfiguration(sousCatTuyaux)).toEqual({ configuree: false, unites: [] });
  });

  it("definir() pose configuree:true et persiste exactement les unités données", () => {
    unites.definir(sousCatTuyaux, ["piece", "metre"]);
    expect(unites.obtenirConfiguration(sousCatTuyaux)).toEqual({ configuree: true, unites: ["metre", "piece"] });
  });

  it("definir() rejette une liste vide — jamais une configuration explicitement vide persistée", () => {
    expect(() => unites.definir(sousCatTuyaux, [])).toThrow(/au moins une unité/);
    expect(unites.obtenirConfiguration(sousCatTuyaux)).toEqual({ configuree: false, unites: [] });
  });

  it("definir() appelé deux fois remplace la configuration précédente, jamais une accumulation", () => {
    unites.definir(sousCatTuyaux, ["piece", "metre"]);
    unites.definir(sousCatTuyaux, ["carton"]);
    expect(unites.obtenirConfiguration(sousCatTuyaux)).toEqual({ configuree: true, unites: ["carton"] });
  });

  it("reinitialiser() revient à l'état non configuré — distinct de definir(id, []) qui est refusé", () => {
    unites.definir(sousCatTuyaux, ["piece"]);
    unites.reinitialiser(sousCatTuyaux);
    expect(unites.obtenirConfiguration(sousCatTuyaux)).toEqual({ configuree: false, unites: [] });
  });

  it("isole correctement les configurations de deux sous-catégories différentes", () => {
    unites.definir(sousCatTuyaux, ["piece", "metre"]);
    unites.definir(sousCatCables, ["metre"]);
    expect(unites.obtenirConfiguration(sousCatTuyaux).unites).toEqual(["metre", "piece"]);
    expect(unites.obtenirConfiguration(sousCatCables).unites).toEqual(["metre"]);
  });

  it("listGroupesParSousCategorie() regroupe toutes les sous-catégories, configurées ou non, en un seul aller-retour", () => {
    unites.definir(sousCatTuyaux, ["piece", "metre"]);

    const groupes = unites.listGroupesParSousCategorie();
    expect(groupes[sousCatTuyaux]).toEqual({ configuree: true, unites: ["metre", "piece"] });
    expect(groupes[sousCatCables]).toEqual({ configuree: false, unites: [] });
  });
});
