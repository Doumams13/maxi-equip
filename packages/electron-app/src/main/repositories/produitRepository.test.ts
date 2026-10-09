import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ProduitRepository } from "./produitRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-produit-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/**
 * Correction "le prix de référence est au m², pas au carton" (2026-10-08)
 * — carreauxParCarton (nombre de carreaux par carton, varie selon la
 * taille) doit survivre à la création, la modification, et rester NULL
 * tant que non renseigné — base réelle, jamais un repository mocké.
 */
describe("ProduitRepository — carreauxParCarton, base réelle", () => {
  let db: Database.Database;
  let repository: ProduitRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new ProduitRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("null par défaut quand non renseigné à la création", () => {
    const id = repository.create({ motif: "Marbre", type: "Faïence", taille: "60x60", tailleTri: 60, reference: "MB-6060", prix: 8000, seuilAlerte: 10 });
    expect(repository.findById(id)!.carreauxParCarton).toBeNull();
  });

  it("persiste la valeur fournie à la création", () => {
    const id = repository.create({
      motif: "Marbre", type: "Faïence", taille: "60x60", tailleTri: 60,
      reference: "MB-6060", prix: 8000, carreauxParCarton: 4, seuilAlerte: 10,
    });
    expect(repository.findById(id)!.carreauxParCarton).toBe(4);
  });

  it("modifie la valeur via update()", () => {
    const id = repository.create({
      motif: "Marbre", type: "Faïence", taille: "60x60", tailleTri: 60,
      reference: "MB-6060", prix: 8000, carreauxParCarton: 4, seuilAlerte: 10,
    });
    repository.update(id, { type: "Faïence", taille: "60x60", tailleTri: 60, reference: "MB-6060", prix: 8000, carreauxParCarton: 6, seuilAlerte: 10 });
    expect(repository.findById(id)!.carreauxParCarton).toBe(6);
  });

  it("list()/listByModele() renvoient aussi carreauxParCarton", () => {
    const modeleId = "modele-test-1";
    db.prepare("INSERT INTO modeles_produit (id, motif, type, created_at, updated_at) VALUES (?, 'Marbre', 'Faïence', ?, ?)").run(
      modeleId, new Date().toISOString(), new Date().toISOString()
    );
    repository.create({
      modeleId, motif: "Marbre", type: "Faïence", taille: "40x40", tailleTri: 40,
      reference: "MB-4040", prix: 6500, carreauxParCarton: 12, seuilAlerte: 10,
    });
    expect(repository.list().find((p) => p.reference === "MB-4040")?.carreauxParCarton).toBe(12);
    expect(repository.listByModele(modeleId)[0]?.carreauxParCarton).toBe(12);
  });
});
