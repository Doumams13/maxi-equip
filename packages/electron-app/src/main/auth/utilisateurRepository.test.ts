import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { UtilisateurRepository } from "./utilisateurRepository.js";

/**
 * Tests réels (vraie base SQLite) de `creerDepuisServeur` — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * Phase 1. `upsertDepuisConnexionCentrale` (spécifique au flux de
 * connexion, force toujours actif=1) est déjà couvert indirectement via
 * les tests de `AuthService` — non dupliqué ici.
 */
describe("UtilisateurRepository.creerDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let repository: UtilisateurRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new UtilisateurRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("crée un nouveau compte en conservant EXACTEMENT l'id d'origine, avec un hash local non vérifiable (jamais le vrai mot de passe)", () => {
    repository.creerDepuisServeur({ id: "compte-serveur-1", identifiant: "awa", nom: "Awa Ndiaye", role: "gerant", actif: true });

    const compte = repository.findById("compte-serveur-1");
    expect(compte).toMatchObject({ id: "compte-serveur-1", identifiant: "awa", nom: "Awa Ndiaye", role: "gerant", actif: true });
  });

  it("respecte actif=false — contrairement à upsertDepuisConnexionCentrale, qui force toujours actif=1", () => {
    repository.creerDepuisServeur({ id: "compte-serveur-1", identifiant: "awa", nom: "Awa Ndiaye", role: "gerant", actif: false });

    expect(repository.findById("compte-serveur-1")?.actif).toBe(false);
  });

  it("appelé une seconde fois sur le même id : MET À JOUR la ligne existante, jamais une seconde ligne", () => {
    repository.creerDepuisServeur({ id: "compte-serveur-1", identifiant: "awa", nom: "Awa Ndiaye", role: "gerant", actif: true });
    repository.creerDepuisServeur({ id: "compte-serveur-1", identifiant: "awa", nom: "Awa Ndiaye (renommée)", role: "administrateur", actif: false });

    expect(repository.list().filter((u) => u.id === "compte-serveur-1")).toHaveLength(1);
    const compte = repository.findById("compte-serveur-1");
    expect(compte).toMatchObject({ nom: "Awa Ndiaye (renommée)", role: "administrateur", actif: false });
  });

  it("ne touche jamais le password_hash d'un compte déjà présent localement", () => {
    const idLocal = repository.create({ nom: "Jean Local", identifiant: "jean.local", passwordHash: "hash-local-reel", role: "administrateur" });
    const avant = repository.findByIdPourSynchronisation(idLocal);

    repository.creerDepuisServeur({ id: idLocal, identifiant: "jean.local", nom: "Jean Local", role: "administrateur", actif: true });

    const apres = repository.findByIdPourSynchronisation(idLocal);
    expect(apres?.passwordHash).toBe(avant?.passwordHash);
  });
});
