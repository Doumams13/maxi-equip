import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { EmplacementRepository } from "./emplacementRepository.js";

/**
 * Tests réels (vraie base SQLite) de `creerDepuisServeur` — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * seule méthode ajoutée à ce dépôt pour cette correction (le reste de
 * `EmplacementRepository` est déjà couvert ailleurs, via les tests
 * d'intégration IPC).
 */
describe("EmplacementRepository.creerDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let repository: EmplacementRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new EmplacementRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("crée un nouveau dépôt en conservant EXACTEMENT l'id d'origine (jamais un nouvel UUID local)", () => {
    repository.creerDepuisServeur({ id: "depot-serveur-1", nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: true });

    const emplacement = repository.findById("depot-serveur-1");
    expect(emplacement).toMatchObject({ id: "depot-serveur-1", nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: true });
  });

  it("appelé une seconde fois sur le même id : MET À JOUR la ligne existante, jamais une seconde ligne", () => {
    repository.creerDepuisServeur({ id: "depot-serveur-1", nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: true });
    repository.creerDepuisServeur({ id: "depot-serveur-1", nom: "Akébé renommé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: false });

    expect(repository.list().filter((e) => e.id === "depot-serveur-1")).toHaveLength(1);
    const emplacement = repository.findById("depot-serveur-1");
    expect(emplacement).toMatchObject({ nom: "Akébé renommé", actif: false });
  });

  it("ne touche jamais un emplacement local d'id différent", () => {
    const idLocal = repository.create({ nom: "SHOP", type: "shop", ville: "Libreville", estPointDeVente: true });
    repository.creerDepuisServeur({ id: "depot-serveur-1", nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: true });

    expect(repository.list()).toHaveLength(2);
    expect(repository.findById(idLocal)?.nom).toBe("SHOP");
  });
});
