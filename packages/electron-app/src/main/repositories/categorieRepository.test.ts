import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "./categorieRepository.js";
import { SousCategorieRepository } from "./sousCategorieRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-categorie-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/**
 * ModeleRepository n'expose pas encore `sousCategorieId` à ce stade
 * (fondations Phase 1, voir schema.sql) — un modèle de test est donc
 * inséré directement en SQL, sans passer par le repository, uniquement
 * pour exercer les requêtes de comptage ci-dessous.
 */
function creerModeleDeTest(db: Database.Database, id: string, sousCategorieId: string, deletedAt: string | null = null): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)"
  ).run(id, `Modèle ${id}`, "Test", sousCategorieId, deletedAt, now, now);
}

describe("CategorieRepository — fondations quincaillerie (Phase 1), base réelle", () => {
  let db: Database.Database;
  let categories: CategorieRepository;
  let sousCategories: SousCategorieRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    categories = new CategorieRepository(db);
    sousCategories = new SousCategorieRepository(db);
  });

  afterEach(() => {
    db.close();
  });
  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("la migration a déjà créé 'Carrelage et revêtements' au premier démarrage — list() la retrouve", () => {
    const liste = categories.list();
    expect(liste.map((c) => c.nom)).toContain("Carrelage et revêtements");
  });

  it("crée une catégorie puis une sous-catégorie, les retrouve par leur id", () => {
    const catId = categories.create({ nom: "Plomberie et évacuation", ordre: 1 });
    const sousCatId = sousCategories.create({ categorieId: catId, nom: "Tuyaux", ordre: 0 });

    expect(categories.findById(catId)?.nom).toBe("Plomberie et évacuation");
    expect(sousCategories.findById(sousCatId)?.categorieId).toBe(catId);
  });

  it("modifier le nom/image/ordre d'une catégorie ne touche jamais ses sous-catégories", () => {
    const catId = categories.create({ nom: "Électricité" });
    const sousCatId = sousCategories.create({ categorieId: catId, nom: "Câblage" });
    categories.update(catId, { nom: "Électricité et éclairage", imageDataUrl: "data:image/png;base64,abc" });
    expect(categories.findById(catId)?.nom).toBe("Électricité et éclairage");
    expect(categories.findById(catId)?.imageDataUrl).toBe("data:image/png;base64,abc");
    expect(sousCategories.findById(sousCatId)?.nom).toBe("Câblage");
  });

  it("suppression douce : une catégorie supprimée disparaît de list(), jamais détruite physiquement", () => {
    const catId = categories.create({ nom: "Peinture et décoration" });
    categories.softDelete(catId, "user-1");
    expect(categories.list().some((c) => c.id === catId)).toBe(false);
    const row = db.prepare("SELECT deleted_at, deleted_by FROM categories WHERE id = ?").get(catId) as { deleted_at: string | null; deleted_by: string | null };
    expect(row.deleted_at).not.toBeNull();
    expect(row.deleted_by).toBe("user-1");
  });

  it("compterModelesParCategorie() reflète le nombre réel de modèles actifs, jamais les modèles supprimés", () => {
    const catId = categories.create({ nom: "Plomberie et évacuation" });
    const sousCatId = sousCategories.create({ categorieId: catId, nom: "Tuyaux" });
    creerModeleDeTest(db, "m1", sousCatId, new Date().toISOString()); // soft-deleted, ne doit jamais compter.
    creerModeleDeTest(db, "m2", sousCatId);

    const compteurs = categories.compterModelesParCategorie();
    expect(compteurs[catId]).toBe(1);
  });

  it("compterModelesParSousCategorie() groupe correctement sur plusieurs sous-catégories d'une même catégorie", () => {
    const catId = categories.create({ nom: "Plomberie et évacuation" });
    const sousCat1 = sousCategories.create({ categorieId: catId, nom: "Tuyaux" });
    const sousCat2 = sousCategories.create({ categorieId: catId, nom: "Raccords" });
    creerModeleDeTest(db, "m1", sousCat1);
    creerModeleDeTest(db, "m2", sousCat1);
    creerModeleDeTest(db, "m3", sousCat2);

    const compteurs = sousCategories.compterModelesParSousCategorie(catId);
    expect(compteurs[sousCat1]).toBe(2);
    expect(compteurs[sousCat2]).toBe(1);
  });

  it("BUG À ÉVITER (\"Carreaux (0)\") : compterModelesParSousCategorie() SANS categorieId calcule aussi de vrais compteurs, jamais {} par défaut", () => {
    const migrationCarrelage = categories.list().find((c) => c.nom === "Carrelage et revêtements")!;
    const sousCatCarreaux = sousCategories.listByCategorie(migrationCarrelage.id).find((sc) => sc.nom === "Carreaux")!;
    creerModeleDeTest(db, "m1", sousCatCarreaux.id);
    creerModeleDeTest(db, "m2", sousCatCarreaux.id);

    const compteurs = sousCategories.compterModelesParSousCategorie(undefined);
    expect(compteurs[sousCatCarreaux.id]).toBe(2);
  });

  it("un modèle rattaché à une sous-catégorie, puis la sous-catégorie supprimée, n'empêche jamais de retrouver le modèle", () => {
    const catId = categories.create({ nom: "Outillage" });
    const sousCatId = sousCategories.create({ categorieId: catId, nom: "Outillage manuel" });
    creerModeleDeTest(db, "m1", sousCatId);
    sousCategories.softDelete(sousCatId, "user-1");

    const modele = db.prepare("SELECT sous_categorie_id FROM modeles_produit WHERE id = 'm1'").get() as { sous_categorie_id: string };
    expect(modele.sous_categorie_id).toBe(sousCatId); // jamais réinitialisé silencieusement.
  });

  describe("creerDepuisServeur — Phase 5 (référentiel commun), sous-phase 5.4", () => {
    const CATEGORIE_SERVEUR = "11111111-1111-4111-8111-111111111111";

    it("crée une catégorie absente localement, en conservant l'id serveur", () => {
      categories.creerDepuisServeur({ id: CATEGORIE_SERVEUR, nom: "Quincaillerie générale (reçue)", imageDataUrl: null, ordre: 3, updatedAt: "2026-01-01T00:00:00.000Z" });

      const recue = categories.findById(CATEGORIE_SERVEUR);
      expect(recue).toMatchObject({ id: CATEGORIE_SERVEUR, nom: "Quincaillerie générale (reçue)", ordre: 3 });
    });

    it("met à jour une catégorie déjà existante localement — jamais de doublon", () => {
      categories.creerDepuisServeur({ id: CATEGORIE_SERVEUR, nom: "Avant", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" });
      categories.creerDepuisServeur({ id: CATEGORIE_SERVEUR, nom: "Après", imageDataUrl: null, ordre: 5, updatedAt: "2026-01-02T00:00:00.000Z" });

      expect(categories.findById(CATEGORIE_SERVEUR)).toMatchObject({ nom: "Après", ordre: 5 });
      expect(categories.list().filter((c) => c.id === CATEGORIE_SERVEUR)).toHaveLength(1);
    });

    it("conserve l'identifiant serveur EXACT — jamais un nouvel UUID local", () => {
      categories.creerDepuisServeur({ id: CATEGORIE_SERVEUR, nom: "X", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" });
      const row = db.prepare("SELECT id FROM categories WHERE id = ?").get(CATEGORIE_SERVEUR) as { id: string } | undefined;
      expect(row?.id).toBe(CATEGORIE_SERVEUR);
    });
  });
});
