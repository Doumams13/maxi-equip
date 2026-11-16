import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "./categorieRepository.js";
import { SousCategorieRepository } from "./sousCategorieRepository.js";
import { SousCategorieUniteRepository } from "./sousCategorieUniteRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-sous-categorie-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("SousCategorieRepository — fondations quincaillerie (Phase 1), base réelle", () => {
  let db: Database.Database;
  let categories: CategorieRepository;
  let sousCategories: SousCategorieRepository;
  let catPlomberie: string;
  let catElec: string;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    categories = new CategorieRepository(db);
    sousCategories = new SousCategorieRepository(db);
    catPlomberie = categories.create({ nom: "Plomberie et évacuation" });
    catElec = categories.create({ nom: "Électricité" });
  });

  afterEach(() => {
    db.close();
  });
  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("create() puis findById() retrouve la sous-catégorie avec sa catégorie parente", () => {
    const id = sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux", ordre: 2 });
    const trouvee = sousCategories.findById(id);
    expect(trouvee?.nom).toBe("Tuyaux");
    expect(trouvee?.categorieId).toBe(catPlomberie);
    expect(trouvee?.ordre).toBe(2);
  });

  it("findById() sur un id inconnu renvoie null, jamais une exception", () => {
    expect(sousCategories.findById("inconnu")).toBeNull();
  });

  it("list() ne renvoie que les sous-catégories actives, triées par ordre puis nom", () => {
    // La migration a déjà créé "Carrelage et revêtements" > "Carreaux" (ordre 0) — la liste n'est donc jamais vide au départ.
    const b = sousCategories.create({ categorieId: catPlomberie, nom: "Robinetterie", ordre: 1 });
    const a = sousCategories.create({ categorieId: catElec, nom: "Câbles", ordre: 0 });
    const supprimee = sousCategories.create({ categorieId: catPlomberie, nom: "Obsolète", ordre: 2 });
    sousCategories.softDelete(supprimee, "user-1");

    const liste = sousCategories.list();
    expect(liste.map((sc) => sc.id)).toEqual(expect.arrayContaining([a, b]));
    expect(liste.some((sc) => sc.id === supprimee)).toBe(false);
    // Parmi les deux créées ici, "Câbles" (ordre 0) précède bien "Robinetterie" (ordre 1).
    const indexA = liste.findIndex((sc) => sc.id === a);
    const indexB = liste.findIndex((sc) => sc.id === b);
    expect(indexA).toBeLessThan(indexB);
  });

  it("listByCategorie() isole correctement deux catégories différentes", () => {
    sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux" });
    sousCategories.create({ categorieId: catPlomberie, nom: "Raccords" });
    sousCategories.create({ categorieId: catElec, nom: "Câbles" });

    expect(sousCategories.listByCategorie(catPlomberie)).toHaveLength(2);
    expect(sousCategories.listByCategorie(catElec)).toHaveLength(1);
  });

  it("update() modifie le nom et/ou l'ordre indépendamment, jamais l'autre champ si non fourni", () => {
    const id = sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux", ordre: 0 });
    sousCategories.update(id, { nom: "Tuyaux et raccords" });
    expect(sousCategories.findById(id)?.nom).toBe("Tuyaux et raccords");
    expect(sousCategories.findById(id)?.ordre).toBe(0);

    sousCategories.update(id, { ordre: 5 });
    expect(sousCategories.findById(id)?.nom).toBe("Tuyaux et raccords");
    expect(sousCategories.findById(id)?.ordre).toBe(5);
  });

  it("softDelete() retire la sous-catégorie de list()/listByCategorie(), jamais une destruction physique", () => {
    const id = sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux" });
    sousCategories.softDelete(id, "user-1");

    expect(sousCategories.list().some((sc) => sc.id === id)).toBe(false);
    expect(sousCategories.listByCategorie(catPlomberie).some((sc) => sc.id === id)).toBe(false);
    const row = db.prepare("SELECT deleted_at, deleted_by FROM sous_categories WHERE id = ?").get(id) as { deleted_at: string | null; deleted_by: string | null };
    expect(row.deleted_at).not.toBeNull();
    expect(row.deleted_by).toBe("user-1");
  });

  it("compterModelesParSousCategorie() sans argument renvoie {} si aucun modèle n'est classé, jamais une exception", () => {
    sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux" });
    expect(sousCategories.compterModelesParSousCategorie()).toEqual({});
  });

  it("compterModelesParSousCategorie(categorieId) restreint le calcul à une seule catégorie", () => {
    const sousCatPlomberie = sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux" });
    const sousCatElec = sousCategories.create({ categorieId: catElec, nom: "Câbles" });
    const now = new Date().toISOString();
    db.prepare("INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, created_at, updated_at) VALUES ('m1', 'Tuyau PVC', 'Plomberie', ?, ?, ?)").run(
      sousCatPlomberie,
      now,
      now
    );
    db.prepare("INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, created_at, updated_at) VALUES ('m2', 'Câble souple', 'Électricité', ?, ?, ?)").run(
      sousCatElec,
      now,
      now
    );

    expect(sousCategories.compterModelesParSousCategorie(catPlomberie)).toEqual({ [sousCatPlomberie]: 1 });
  });

  // Fondations quincaillerie (Phase 3 bis).
  it("modelePhysique vaut null pour une sous-catégorie ordinaire, et 'carreau' pour 'Carreaux' (posé par migration)", () => {
    const tuyaux = sousCategories.create({ categorieId: catPlomberie, nom: "Tuyaux" });
    expect(sousCategories.findById(tuyaux)!.modelePhysique).toBeNull();

    const carreaux = db.prepare("SELECT id FROM sous_categories WHERE nom = 'Carreaux'").get() as { id: string };
    expect(sousCategories.findById(carreaux.id)!.modelePhysique).toBe("carreau");
    expect(sousCategories.list().find((sc) => sc.id === carreaux.id)!.modelePhysique).toBe("carreau");
  });

  describe("creerDepuisServeur — Phase 5 (référentiel commun), sous-phase 5.4", () => {
    const SOUS_CATEGORIE_SERVEUR = "22222222-2222-4222-8222-222222222222";
    let unites: SousCategorieUniteRepository;

    beforeEach(() => {
      unites = new SousCategorieUniteRepository(db);
    });

    it("crée une sous-catégorie absente localement, en conservant l'id serveur, sans configuration d'unités (null)", () => {
      const applique = sousCategories.creerDepuisServeur(
        { id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Tuyaux (reçue)", ordre: 2, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        null
      );
      expect(applique).toBe(true);

      const recue = sousCategories.findById(SOUS_CATEGORIE_SERVEUR);
      expect(recue).toMatchObject({ id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Tuyaux (reçue)", ordre: 2 });
      expect(unites.obtenirConfiguration(SOUS_CATEGORIE_SERVEUR)).toEqual({ configuree: false, unites: [] });
    });

    it("met à jour une sous-catégorie déjà existante localement — jamais de doublon", () => {
      sousCategories.creerDepuisServeur({ id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Avant", ordre: 0, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" }, null);
      sousCategories.creerDepuisServeur({ id: SOUS_CATEGORIE_SERVEUR, categorieId: catElec, nom: "Après", ordre: 5, modelePhysique: null, updatedAt: "2026-01-02T00:00:00.000Z" }, null);

      expect(sousCategories.findById(SOUS_CATEGORIE_SERVEUR)).toMatchObject({ nom: "Après", ordre: 5, categorieId: catElec });
      expect(sousCategories.list().filter((sc) => sc.id === SOUS_CATEGORIE_SERVEUR)).toHaveLength(1);
    });

    it("applique correctement une configuration d'unités EXPLICITE reçue en sous-objet (jamais une entité séparée)", () => {
      sousCategories.creerDepuisServeur(
        { id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Ciments", ordre: 0, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ["sac", "kg"]
      );
      expect(unites.obtenirConfiguration(SOUS_CATEGORIE_SERVEUR)).toEqual({ configuree: true, unites: ["kg", "sac"] });
    });

    it("unitesAutorisees vide ou null applique reinitialiser() — jamais une liste vide transmise à definir()", () => {
      // Configure explicitement d'abord, puis reçoit une configuration vide : doit repasser à "non configurée", jamais planter.
      sousCategories.creerDepuisServeur(
        { id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Ciments", ordre: 0, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ["sac"]
      );
      expect(unites.obtenirConfiguration(SOUS_CATEGORIE_SERVEUR).configuree).toBe(true);

      sousCategories.creerDepuisServeur(
        { id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Ciments", ordre: 0, modelePhysique: null, updatedAt: "2026-01-02T00:00:00.000Z" },
        []
      );
      expect(unites.obtenirConfiguration(SOUS_CATEGORIE_SERVEUR)).toEqual({ configuree: false, unites: [] });
    });

    it("sous-catégorie reçue AVANT sa catégorie parente (FK locale pas encore connue) : renvoie false, jamais une exception, rien n'est créé", () => {
      const CATEGORIE_INCONNUE = "99999999-9999-4999-8999-999999999999";
      const applique = sousCategories.creerDepuisServeur(
        { id: SOUS_CATEGORIE_SERVEUR, categorieId: CATEGORIE_INCONNUE, nom: "Orpheline", ordre: 0, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ["kg"]
      );
      expect(applique).toBe(false);
      expect(sousCategories.findById(SOUS_CATEGORIE_SERVEUR)).toBeNull();
      // Pas davantage d'unités orphelines créées malgré l'échec.
      expect(unites.obtenirConfiguration(SOUS_CATEGORIE_SERVEUR)).toEqual({ configuree: false, unites: [] });
    });

    it("ROLLBACK COMPLET et réel : un échec dans l'application des unités annule aussi l'upsert de la sous-catégorie elle-même (transaction englobante, SAVEPOINT imbriqué vérifié)", () => {
      // Provoque une VRAIE violation de contrainte SQL (PRIMARY KEY (sous_categorie_id, unite_vente) dupliquée
      // par la seconde insertion du même "sac") à l'intérieur de SousCategorieUniteRepository.definir() —
      // jamais un mock, jamais un throw artificiel.
      const applique = sousCategories.creerDepuisServeur(
        { id: SOUS_CATEGORIE_SERVEUR, categorieId: catPlomberie, nom: "Ne doit jamais exister", ordre: 0, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ["sac", "sac"]
      );
      expect(applique).toBe(false);
      // La sous-catégorie elle-même, pourtant valide isolément, ne doit PAS avoir été créée — preuve du rollback de la transaction englobante.
      expect(sousCategories.findById(SOUS_CATEGORIE_SERVEUR)).toBeNull();
      expect(unites.obtenirConfiguration(SOUS_CATEGORIE_SERVEUR)).toEqual({ configuree: false, unites: [] });
    });
  });
});
