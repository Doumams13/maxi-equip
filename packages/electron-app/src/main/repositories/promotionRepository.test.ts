import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { PromotionRepository } from "./promotionRepository.js";

const CHEMIN_DB = join(tmpdir(), "test-promotion-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/**
 * Bilan d'activité (2026-10-21) — `compterChevauchantPeriode` doit
 * compter toute promotion qui CHEVAUCHE la période, même partiellement,
 * contrairement à `compterActives` qui ne regarde qu'un seul instant.
 */
describe("PromotionRepository.compterChevauchantPeriode — base réelle", () => {
  let db: Database.Database;
  let repository: PromotionRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new PromotionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("compte une promotion entièrement incluse dans la période", () => {
    repository.create({
      libelle: "Promo incluse", typeReduction: "pourcentage", valeur: 10, perimetre: "global", produitIds: [],
      dateDebut: "2026-01-10T00:00:00.000Z", dateFin: "2026-01-15T00:00:00.000Z",
    });
    expect(repository.compterChevauchantPeriode("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z")).toBe(1);
  });

  it("compte une promotion qui déborde la période des deux côtés (chevauchement partiel)", () => {
    repository.create({
      libelle: "Promo débordante", typeReduction: "pourcentage", valeur: 10, perimetre: "global", produitIds: [],
      dateDebut: "2025-12-20T00:00:00.000Z", dateFin: "2026-02-05T00:00:00.000Z",
    });
    expect(repository.compterChevauchantPeriode("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z")).toBe(1);
  });

  it("ne compte PAS une promotion strictement terminée avant la période", () => {
    repository.create({
      libelle: "Promo passée", typeReduction: "pourcentage", valeur: 10, perimetre: "global", produitIds: [],
      dateDebut: "2025-11-01T00:00:00.000Z", dateFin: "2025-12-31T00:00:00.000Z",
    });
    expect(repository.compterChevauchantPeriode("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z")).toBe(0);
  });

  it("ne compte PAS une promotion qui ne commence qu'après la période", () => {
    repository.create({
      libelle: "Promo future", typeReduction: "pourcentage", valeur: 10, perimetre: "global", produitIds: [],
      dateDebut: "2026-02-01T00:00:00.000Z", dateFin: "2026-02-28T00:00:00.000Z",
    });
    expect(repository.compterChevauchantPeriode("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z")).toBe(0);
  });
});
