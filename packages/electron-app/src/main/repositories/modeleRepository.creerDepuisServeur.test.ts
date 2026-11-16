import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ModeleRepository } from "./modeleRepository.js";
import { CategorieRepository } from "./categorieRepository.js";
import { SousCategorieRepository } from "./sousCategorieRepository.js";

/**
 * Tests réels (vraie base SQLite) de `creerDepuisServeur` — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * Phase 2.
 */
describe("ModeleRepository.creerDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let repository: ModeleRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new ModeleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("crée un nouveau modèle en conservant EXACTEMENT l'id d'origine", () => {
    repository.creerDepuisServeur({ id: "modele-serveur-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null });

    const modele = repository.findById("modele-serveur-1");
    expect(modele).toMatchObject({ id: "modele-serveur-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null });
  });

  it("appelé une seconde fois sur le même id : MET À JOUR la ligne existante, jamais une seconde ligne", () => {
    repository.creerDepuisServeur({ id: "modele-serveur-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null });
    repository.creerDepuisServeur({ id: "modele-serveur-1", motif: "Marbre Blanc XL", type: "Grès cérame", ordreVitrine: 2 });

    expect(repository.list().filter((m) => m.id === "modele-serveur-1")).toHaveLength(1);
    const modele = repository.findById("modele-serveur-1");
    expect(modele).toMatchObject({ motif: "Marbre Blanc XL", type: "Grès cérame", ordreVitrine: 2 });
  });

  describe("Phase 5 (référentiel commun), sous-phase 5.5 — sousCategorieId/marque", () => {
    it("persiste sousCategorieId et marque quand ils sont fournis", () => {
      const catId = new CategorieRepository(db).create({ nom: "Revêtements" });
      const sousCatId = new SousCategorieRepository(db).create({ categorieId: catId, nom: "Carreaux" });
      repository.creerDepuisServeur({ id: "modele-serveur-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null, sousCategorieId: sousCatId, marque: "Somany" });
      expect(repository.findById("modele-serveur-1")).toMatchObject({ sousCategorieId: sousCatId, marque: "Somany" });
    });

    it("rétrocompatibilité : un ancien payload SANS sousCategorieId/marque les traite comme null, jamais une exception", () => {
      expect(() => repository.creerDepuisServeur({ id: "modele-serveur-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null })).not.toThrow();
      expect(repository.findById("modele-serveur-1")).toMatchObject({ sousCategorieId: null, marque: null });
    });
  });
});
