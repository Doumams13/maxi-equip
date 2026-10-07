import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ModeleRepository } from "./modeleRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-modele-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("ModeleRepository — vitrine du site (ordreVitrine), base réelle", () => {
  let db: Database.Database;
  let repository: ModeleRepository;
  let m1: string;
  let m2: string;
  let m3: string;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new ModeleRepository(db);
    m1 = repository.create({ motif: "Marbre Blanc", type: "Faïence" });
    m2 = repository.create({ motif: "Granit Noir", type: "Grès cérame" });
    m3 = repository.create({ motif: "Terre Cuite", type: "Antidérapant" });
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("un modèle nouvellement créé n'est pas dans la vitrine (ordreVitrine null)", () => {
    expect(repository.findById(m1)!.ordreVitrine).toBeNull();
  });

  it("définit l'ordre de vitrine pour les modèles sélectionnés, dans l'ordre donné", () => {
    repository.definirVitrine([m2, m1]);
    expect(repository.findById(m2)!.ordreVitrine).toBe(0);
    expect(repository.findById(m1)!.ordreVitrine).toBe(1);
    expect(repository.findById(m3)!.ordreVitrine).toBeNull();
  });

  it("retire de la vitrine un modèle absent d'un appel ultérieur (jamais seulement additif)", () => {
    repository.definirVitrine([m1, m2, m3]);
    repository.definirVitrine([m3, m1]);
    expect(repository.findById(m3)!.ordreVitrine).toBe(0);
    expect(repository.findById(m1)!.ordreVitrine).toBe(1);
    expect(repository.findById(m2)!.ordreVitrine).toBeNull();
  });

  it("ne retourne que les modèles dont ordreVitrine a réellement changé", () => {
    repository.definirVitrine([m1, m2]);
    const modifies = repository.definirVitrine([m1, m3]);
    const ids = modifies.map((m) => m.id).sort();
    // m1 reste à la position 0 (inchangé) ; m2 passe à null (retiré) ; m3 passe à 1 (ajouté).
    expect(ids).toEqual([m2, m3].sort());
  });

  it("une liste vide retire tous les modèles de la vitrine", () => {
    repository.definirVitrine([m1, m2]);
    const modifies = repository.definirVitrine([]);
    expect(modifies.map((m) => m.id).sort()).toEqual([m1, m2].sort());
    expect(repository.findById(m1)!.ordreVitrine).toBeNull();
    expect(repository.findById(m2)!.ordreVitrine).toBeNull();
  });
});
