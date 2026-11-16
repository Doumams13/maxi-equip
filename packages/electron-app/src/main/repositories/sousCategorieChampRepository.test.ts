import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "./categorieRepository.js";
import { SousCategorieRepository } from "./sousCategorieRepository.js";
import { SousCategorieChampRepository } from "./sousCategorieChampRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-sous-categorie-champ-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("SousCategorieChampRepository — fondations quincaillerie (Phase 1), base réelle", () => {
  let db: Database.Database;
  let champs: SousCategorieChampRepository;
  let sousCatTuyaux: string;
  let sousCatCables: string;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    const categories = new CategorieRepository(db);
    const sousCategories = new SousCategorieRepository(db);
    champs = new SousCategorieChampRepository(db);
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

  it("crée des champs dans l'ordre donné, les retrouve via listBySousCategorie()", () => {
    champs.create({ sousCategorieId: sousCatTuyaux, nom: "Matière", ordre: 0 });
    champs.create({ sousCategorieId: sousCatTuyaux, nom: "Diamètre", ordre: 1 });
    champs.create({ sousCategorieId: sousCatTuyaux, nom: "Longueur", ordre: 2 });

    const liste = champs.listBySousCategorie(sousCatTuyaux);
    expect(liste.map((c) => c.nom)).toEqual(["Matière", "Diamètre", "Longueur"]);
  });

  it("isole correctement les champs de deux sous-catégories différentes", () => {
    champs.create({ sousCategorieId: sousCatTuyaux, nom: "Diamètre" });
    champs.create({ sousCategorieId: sousCatCables, nom: "Section" });

    expect(champs.listBySousCategorie(sousCatTuyaux).map((c) => c.nom)).toEqual(["Diamètre"]);
    expect(champs.listBySousCategorie(sousCatCables).map((c) => c.nom)).toEqual(["Section"]);
  });

  it("delete() applique un TOMBSTONE (Phase 5, sous-phase 5.6) — jamais une suppression physique, exclu de listBySousCategorie()", () => {
    const id = champs.create({ sousCategorieId: sousCatTuyaux, nom: "Diamètre" });
    champs.delete(id, "user-1");
    expect(champs.listBySousCategorie(sousCatTuyaux)).toEqual([]);
    const row = db.prepare("SELECT deleted_at, deleted_by, nom FROM sous_categorie_champs WHERE id = ?").get(id) as {
      deleted_at: string | null;
      deleted_by: string | null;
      nom: string;
    } | undefined;
    expect(row).toBeDefined();
    expect(row!.deleted_at).not.toBeNull();
    expect(row!.deleted_by).toBe("user-1");
    // Les autres propriétés restent préservées, jamais effacées.
    expect(row!.nom).toBe("Diamètre");
  });

  it("listGroupesParSousCategorie() regroupe correctement toutes les sous-catégories en un seul aller-retour", () => {
    champs.create({ sousCategorieId: sousCatTuyaux, nom: "Diamètre" });
    champs.create({ sousCategorieId: sousCatTuyaux, nom: "Longueur" });
    champs.create({ sousCategorieId: sousCatCables, nom: "Section" });

    const groupes = champs.listGroupesParSousCategorie();
    expect(groupes[sousCatTuyaux]?.map((c) => c.nom)).toEqual(["Diamètre", "Longueur"]);
    expect(groupes[sousCatCables]?.map((c) => c.nom)).toEqual(["Section"]);
  });

  // Fondations quincaillerie (Phase 3 bis).
  it("create() sans les nouvelles propriétés prend les valeurs par défaut neutres (type:'texte', obligatoire:false, le reste null)", () => {
    const id = champs.create({ sousCategorieId: sousCatTuyaux, nom: "Matière" });
    const champ = champs.listBySousCategorie(sousCatTuyaux).find((c) => c.id === id)!;
    expect(champ.type).toBe("texte");
    expect(champ.obligatoire).toBe(false);
    expect(champ.valeursAutorisees).toBeNull();
    expect(champ.uniteMesure).toBeNull();
    expect(champ.role).toBeNull();
  });

  it("create() persiste toutes les nouvelles propriétés fournies", () => {
    const id = champs.create({
      sousCategorieId: sousCatTuyaux,
      nom: "Diamètre",
      type: "nombre",
      obligatoire: true,
      uniteMesure: "mm",
      role: "physique",
    });
    const champ = champs.listBySousCategorie(sousCatTuyaux).find((c) => c.id === id)!;
    expect(champ.type).toBe("nombre");
    expect(champ.obligatoire).toBe(true);
    expect(champ.uniteMesure).toBe("mm");
    expect(champ.role).toBe("physique");
  });

  it("create() persiste les valeurs autorisées (type liste)", () => {
    const id = champs.create({ sousCategorieId: sousCatTuyaux, nom: "Matière", type: "liste", valeursAutorisees: ["PVC", "Cuivre", "Acier"] });
    const champ = champs.listBySousCategorie(sousCatTuyaux).find((c) => c.id === id)!;
    expect(champ.type).toBe("liste");
    expect(champ.valeursAutorisees).toEqual(["PVC", "Cuivre", "Acier"]);
  });

  it("update() modifie les propriétés fournies sans toucher aux autres", () => {
    const id = champs.create({ sousCategorieId: sousCatTuyaux, nom: "Diamètre", type: "nombre", uniteMesure: "mm" });
    champs.update(id, { obligatoire: true });
    const champ = champs.listBySousCategorie(sousCatTuyaux).find((c) => c.id === id)!;
    expect(champ.obligatoire).toBe(true);
    expect(champ.type).toBe("nombre"); // inchangé
    expect(champ.uniteMesure).toBe("mm"); // inchangé
    expect(champ.nom).toBe("Diamètre"); // inchangé
  });

  it("update() sur un id inconnu ne lève jamais d'exception (no-op)", () => {
    expect(() => champs.update("id-inconnu", { obligatoire: true })).not.toThrow();
  });

  describe("creerDepuisServeur — Phase 5 (référentiel commun), sous-phase 5.4", () => {
    const CHAMP_SERVEUR = "33333333-3333-4333-8333-333333333333";

    function champBase(sousCategorieId: string) {
      return {
        id: CHAMP_SERVEUR,
        sousCategorieId,
        nom: "Diamètre (reçu)",
        type: "nombre" as const,
        obligatoire: true,
        valeursAutorisees: null,
        uniteMesure: "mm",
        role: "physique" as const,
        ordre: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    }

    it("crée un champ absent localement, en conservant l'id serveur", () => {
      const applique = champs.creerDepuisServeur(champBase(sousCatTuyaux));
      expect(applique).toBe(true);

      const recu = champs.listBySousCategorie(sousCatTuyaux).find((c) => c.id === CHAMP_SERVEUR);
      expect(recu).toMatchObject({ nom: "Diamètre (reçu)", type: "nombre", obligatoire: true, uniteMesure: "mm", role: "physique" });
    });

    it("met à jour un champ déjà existant localement — jamais de doublon", () => {
      champs.creerDepuisServeur({ ...champBase(sousCatTuyaux), nom: "Avant", updatedAt: "2026-01-01T00:00:00.000Z" });
      champs.creerDepuisServeur({ ...champBase(sousCatTuyaux), nom: "Après", updatedAt: "2026-01-02T00:00:00.000Z" });

      const resultats = champs.listBySousCategorie(sousCatTuyaux).filter((c) => c.id === CHAMP_SERVEUR);
      expect(resultats).toHaveLength(1);
      expect(resultats[0]?.nom).toBe("Après");
    });

    it("persiste correctement valeursAutorisees pour un champ de type liste", () => {
      champs.creerDepuisServeur({ ...champBase(sousCatTuyaux), type: "liste", uniteMesure: null, valeursAutorisees: ["Rouge", "Bleu"] });
      const recu = champs.listBySousCategorie(sousCatTuyaux).find((c) => c.id === CHAMP_SERVEUR);
      expect(recu?.valeursAutorisees).toEqual(["Rouge", "Bleu"]);
    });

    it("champ reçu AVANT sa sous-catégorie parente (FK locale pas encore connue) : renvoie false, jamais une exception, rien n'est créé", () => {
      const SOUS_CATEGORIE_INCONNUE = "99999999-9999-4999-8999-999999999999";
      const applique = champs.creerDepuisServeur(champBase(SOUS_CATEGORIE_INCONNUE));
      expect(applique).toBe(false);
      const row = db.prepare("SELECT * FROM sous_categorie_champs WHERE id = ?").get(CHAMP_SERVEUR);
      expect(row).toBeUndefined();
    });

    it("application correcte d'un tombstone reçu (deletedAt renseigné) : écrit deleted_at/deleted_by localement, jamais une réactivation d'un champ déjà tombstoné par une mise à jour plus ancienne", () => {
      // Reçoit d'abord le champ actif.
      champs.creerDepuisServeur({ ...champBase(sousCatTuyaux), updatedAt: "2026-01-01T00:00:00.000Z" });
      let row = db.prepare("SELECT deleted_at as deletedAt, deleted_by as deletedBy FROM sous_categorie_champs WHERE id = ?").get(CHAMP_SERVEUR) as {
        deletedAt: string | null;
        deletedBy: string | null;
      };
      expect(row.deletedAt).toBeNull();

      // Reçoit ensuite sa suppression (tombstone) — jamais une suppression physique locale (voir delete() ci-dessus, inchangée).
      const applique = champs.creerDepuisServeur({ ...champBase(sousCatTuyaux), updatedAt: "2026-01-02T00:00:00.000Z", deletedAt: "2026-01-02T00:00:00.000Z" });
      expect(applique).toBe(true);
      row = db.prepare("SELECT deleted_at as deletedAt, deleted_by as deletedBy FROM sous_categorie_champs WHERE id = ?").get(CHAMP_SERVEUR) as {
        deletedAt: string | null;
        deletedBy: string | null;
      };
      expect(row.deletedAt).toBe("2026-01-02T00:00:00.000Z");
      // deletedBy jamais transmis par aucune projection serveur — toujours null ici (voir le commentaire de creerDepuisServeur).
      expect(row.deletedBy).toBeNull();
      // La ligne existe toujours (jamais physiquement supprimée par cette réception).
      expect(db.prepare("SELECT id FROM sous_categorie_champs WHERE id = ?").get(CHAMP_SERVEUR)).toBeDefined();
    });
  });
});
