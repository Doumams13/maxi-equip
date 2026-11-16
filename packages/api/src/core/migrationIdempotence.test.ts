import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { SqliteServerStorage } from "./sqliteServerStorage.js";
import { PostgresServerStorage } from "./postgresServerStorage.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.1 — complément de
 * vérification demandé explicitement : idempotence des migrations sur
 * TROIS scénarios distincts, pour les DEUX backends, sur des bases de
 * test isolées, jamais la base réelle :
 *   A. Base VIERGE — jamais migrée.
 *   B. Base DÉJÀ MIGRÉE AVANT la Phase 5 — c'est-à-dire possédant
 *      uniquement le schéma antérieur (sans les colonnes/tables ajoutées
 *      par cette phase), avec des données réelles déjà présentes —
 *      scénario de mise à niveau réel en production.
 *   C. Exécution successive de la migration sur une base DÉJÀ migrée
 *      par le nouveau code — doit rester un no-op, jamais une erreur.
 *
 * Aucune fonctionnalité n'est modifiée par ce fichier — uniquement des
 * tests complémentaires.
 */

describe("Idempotence des migrations — SQLite (fichier réel, jamais :memory:)", () => {
  const dossier = mkdtempSync(join(tmpdir(), "maxiequip-migration-sqlite-"));

  afterAll(() => {
    rmSync(dossier, { recursive: true, force: true });
  });

  it("A — base VIERGE : construction directe, aucune erreur, schéma complet présent", async () => {
    const chemin = join(dossier, "vierge.sqlite");
    let premiereDb: Database.Database | undefined;
    expect(() => {
      premiereDb = new Database(chemin);
      return new SqliteServerStorage(premiereDb);
    }).not.toThrow();
    premiereDb!.close();

    const db = new Database(chemin);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(["catalogue_categories", "catalogue_sous_categories", "catalogue_sous_categorie_champs"])
    );
    const colonnesModeles = (db.prepare("PRAGMA table_info(catalogue_modeles)").all() as { name: string }[]).map((c) => c.name);
    expect(colonnesModeles).toEqual(expect.arrayContaining(["sous_categorie_id", "marque"]));
    const colonnesProduits = (db.prepare("PRAGMA table_info(catalogue_produits)").all() as { name: string }[]).map((c) => c.name);
    expect(colonnesProduits).toEqual(expect.arrayContaining(["unite_vente", "caracteristiques", "marque"]));
    db.close();
  });

  it("B — base DÉJÀ MIGRÉE AVANT la Phase 5 (schéma antérieur reconstitué à la main, avec données réelles) : mise à niveau sans erreur, données existantes préservées, nouvelles colonnes/tables ajoutées", () => {
    const chemin = join(dossier, "ancien-schema.sqlite");
    const ancienne = new Database(chemin);
    // Reconstitue EXACTEMENT le schéma antérieur à cette phase — sans les
    // colonnes/tables que seule SqliteServerStorage (nouvelle version)
    // ajoute désormais. Un modèle et un produit réels y sont insérés
    // AVANT toute migration, pour prouver qu'ils survivent intacts.
    ancienne.exec(`
      CREATE TABLE catalogue_modeles (
        id TEXT PRIMARY KEY, motif TEXT NOT NULL, type TEXT NOT NULL, slug TEXT NOT NULL,
        ordre_vitrine INTEGER, deleted_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE catalogue_produits (
        id TEXT PRIMARY KEY, modele_id TEXT NOT NULL, taille TEXT NOT NULL, taille_tri REAL NOT NULL,
        largeur REAL, hauteur REAL, reference TEXT NOT NULL, prix INTEGER NOT NULL,
        deleted_at TEXT, updated_at TEXT NOT NULL
      );
    `);
    const MODELE_EXISTANT = "aaaaaaaa-0000-4000-8000-000000000001";
    const PRODUIT_EXISTANT = "aaaaaaaa-0000-4000-8000-000000000002";
    ancienne
      .prepare("INSERT INTO catalogue_modeles (id, motif, type, slug, ordre_vitrine, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(MODELE_EXISTANT, "Marbre Déjà Là", "Faïence", "marbre-deja-la", null, null, "2026-01-01T00:00:00.000Z");
    ancienne
      .prepare("INSERT INTO catalogue_produits (id, modele_id, taille, taille_tri, largeur, hauteur, reference, prix, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(PRODUIT_EXISTANT, MODELE_EXISTANT, "60x60", 3600, 60, 60, "DEJA-6060", 15000, null, "2026-01-01T00:00:00.000Z");
    ancienne.close();

    // Mise à niveau réelle : ouvre ce même fichier avec la NOUVELLE classe.
    let storage: SqliteServerStorage | undefined;
    let dbMigration: Database.Database | undefined;
    expect(() => {
      dbMigration = new Database(chemin);
      storage = new SqliteServerStorage(dbMigration);
    }).not.toThrow();
    dbMigration!.close();

    const db = new Database(chemin);
    // Données préexistantes intactes.
    const modele = db.prepare("SELECT motif, slug FROM catalogue_modeles WHERE id = ?").get(MODELE_EXISTANT) as { motif: string; slug: string };
    expect(modele).toEqual({ motif: "Marbre Déjà Là", slug: "marbre-deja-la" });
    const produit = db.prepare("SELECT reference, prix FROM catalogue_produits WHERE id = ?").get(PRODUIT_EXISTANT) as { reference: string; prix: number };
    expect(produit).toEqual({ reference: "DEJA-6060", prix: 15000 });

    // Nouvelles colonnes ajoutées, NULL pour les lignes préexistantes (jamais une valeur inventée).
    const modeleColonnesNeuves = db.prepare("SELECT sous_categorie_id as sousCategorieId, marque FROM catalogue_modeles WHERE id = ?").get(MODELE_EXISTANT) as {
      sousCategorieId: string | null;
      marque: string | null;
    };
    expect(modeleColonnesNeuves).toEqual({ sousCategorieId: null, marque: null });
    const produitColonnesNeuves = db
      .prepare("SELECT unite_vente as uniteVente, caracteristiques, marque FROM catalogue_produits WHERE id = ?")
      .get(PRODUIT_EXISTANT) as { uniteVente: string | null; caracteristiques: string | null; marque: string | null };
    expect(produitColonnesNeuves).toEqual({ uniteVente: null, caracteristiques: null, marque: null });

    // Nouvelles tables présentes et immédiatement fonctionnelles.
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(["catalogue_categories", "catalogue_sous_categories", "catalogue_sous_categorie_champs"]));
    db.close();

    // storage reste utilisable immédiatement après la mise à niveau.
    expect(storage).toBeDefined();
  });

  it("C — exécution successive sur une base DÉJÀ migrée par le nouveau code : aucune erreur, aucune donnée perdue (no-op)", async () => {
    const chemin = join(dossier, "reexecution.sqlite");
    const premiereDb = new Database(chemin);
    const premiere = new SqliteServerStorage(premiereDb);
    await premiere.appliquerOperationCategorie({
      operation: "create",
      categorieId: "bbbbbbbb-0000-4000-8000-000000000001",
      nom: "Catégorie témoin",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await premiere.fermer();

    // Réouvre le MÊME fichier avec une SECONDE instance (simule un
    // redémarrage du serveur après une mise à niveau déjà appliquée).
    let secondeDb: Database.Database | undefined;
    expect(() => {
      secondeDb = new Database(chemin);
      return new SqliteServerStorage(secondeDb);
    }).not.toThrow();
    secondeDb!.close();

    const db = new Database(chemin);
    const categories = db.prepare("SELECT nom FROM catalogue_categories").all() as { nom: string }[];
    expect(categories).toEqual([{ nom: "Catégorie témoin" }]); // toujours UNE SEULE ligne, rien dupliqué/perdu
    db.close();
  });
});

describe("Idempotence des migrations — PostgreSQL (vrai serveur embarqué, bases isolées)", () => {
  const PORT = 54331; // Port distinct de postgresServerStorage.test.ts (54330) — exécution en parallèle possible.
  const DOSSIER_DONNEES = "./.pgdata-test-migration";
  let pgServeur: EmbeddedPostgres;
  const { Pool } = pg;

  beforeAll(async () => {
    rmSync(DOSSIER_DONNEES, { recursive: true, force: true });
    pgServeur = new EmbeddedPostgres({ databaseDir: DOSSIER_DONNEES, user: "maxiequip", password: "test-password", port: PORT, persistent: false });
    await pgServeur.initialise();
    await pgServeur.start();
  }, 60_000);

  afterAll(async () => {
    await pgServeur?.stop();
    rmSync(DOSSIER_DONNEES, { recursive: true, force: true });
  }, 30_000);

  it("A — base VIERGE : migrer() réussit sans erreur, schéma complet présent", async () => {
    await pgServeur.createDatabase("vierge_test");
    const storage = new PostgresServerStorage(`postgres://maxiequip:test-password@localhost:${PORT}/vierge_test`);
    await expect(storage.migrer()).resolves.toBeUndefined();

    const pool = new Pool({ connectionString: `postgres://maxiequip:test-password@localhost:${PORT}/vierge_test` });
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const noms = (tables.rows as { table_name: string }[]).map((r) => r.table_name);
    expect(noms).toEqual(expect.arrayContaining(["catalogue_categories", "catalogue_sous_categories", "catalogue_sous_categorie_champs"]));
    const colonnesModeles = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'catalogue_modeles'");
    expect((colonnesModeles.rows as { column_name: string }[]).map((r) => r.column_name)).toEqual(expect.arrayContaining(["sous_categorie_id", "marque"]));
    await pool.end();
    await storage.fermer();
  });

  it("B — base DÉJÀ MIGRÉE AVANT la Phase 5 (schéma antérieur reconstitué à la main, avec données réelles) : migrer() ajoute ce qui manque, préserve les données existantes", async () => {
    await pgServeur.createDatabase("ancien_schema_test");
    const url = `postgres://maxiequip:test-password@localhost:${PORT}/ancien_schema_test`;
    const pool = new Pool({ connectionString: url });

    // Reconstitue le schéma antérieur à cette phase — AUCUNE des colonnes
    // ajoutées par Phase 5 (sous_categorie_id/marque sur catalogue_modeles,
    // marque sur catalogue_produits), aucune des 3 nouvelles tables.
    await pool.query(`
      CREATE TABLE catalogue_modeles (
        id TEXT PRIMARY KEY, motif TEXT NOT NULL, type TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
        ordre_vitrine INTEGER, deleted_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE catalogue_produits (
        id TEXT PRIMARY KEY, modele_id TEXT NOT NULL, taille TEXT NOT NULL, taille_tri DOUBLE PRECISION NOT NULL,
        largeur DOUBLE PRECISION, hauteur DOUBLE PRECISION, reference TEXT NOT NULL, prix INTEGER NOT NULL,
        unite_vente TEXT, caracteristiques TEXT, deleted_at TEXT, updated_at TEXT NOT NULL
      );
    `);
    const MODELE_EXISTANT = "cccccccc-0000-4000-8000-000000000001";
    const PRODUIT_EXISTANT = "cccccccc-0000-4000-8000-000000000002";
    await pool.query(
      "INSERT INTO catalogue_modeles (id, motif, type, slug, ordre_vitrine, deleted_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [MODELE_EXISTANT, "Marbre PG Déjà Là", "Faïence", "marbre-pg-deja-la", null, null, "2026-01-01T00:00:00.000Z"]
    );
    await pool.query(
      "INSERT INTO catalogue_produits (id, modele_id, taille, taille_tri, largeur, hauteur, reference, prix, unite_vente, caracteristiques, deleted_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [PRODUIT_EXISTANT, MODELE_EXISTANT, "60x60", 3600, 60, 60, "PG-DEJA-6060", 15000, null, null, null, "2026-01-01T00:00:00.000Z"]
    );

    const storage = new PostgresServerStorage(url);
    await expect(storage.migrer()).resolves.toBeUndefined();

    // Données préexistantes intactes.
    const modele = await pool.query("SELECT motif, slug FROM catalogue_modeles WHERE id = $1", [MODELE_EXISTANT]);
    expect(modele.rows[0]).toEqual({ motif: "Marbre PG Déjà Là", slug: "marbre-pg-deja-la" });
    const produit = await pool.query("SELECT reference, prix FROM catalogue_produits WHERE id = $1", [PRODUIT_EXISTANT]);
    expect(produit.rows[0]).toEqual({ reference: "PG-DEJA-6060", prix: 15000 });

    // Nouvelles colonnes ajoutées, NULL pour les lignes préexistantes.
    const nouvelles = await pool.query('SELECT sous_categorie_id as "sousCategorieId", marque FROM catalogue_modeles WHERE id = $1', [MODELE_EXISTANT]);
    expect(nouvelles.rows[0]).toEqual({ sousCategorieId: null, marque: null });
    const produitMarque = await pool.query("SELECT marque FROM catalogue_produits WHERE id = $1", [PRODUIT_EXISTANT]);
    expect(produitMarque.rows[0]).toEqual({ marque: null });

    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    expect((tables.rows as { table_name: string }[]).map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["catalogue_categories", "catalogue_sous_categories", "catalogue_sous_categorie_champs"])
    );

    await pool.end();
    await storage.fermer();
  });

  it("C — exécution successive de migrer() sur une base DÉJÀ migrée par le nouveau code : aucune erreur, aucune donnée perdue (no-op)", async () => {
    await pgServeur.createDatabase("reexecution_test");
    const url = `postgres://maxiequip:test-password@localhost:${PORT}/reexecution_test`;
    const storage = new PostgresServerStorage(url);
    await storage.migrer();
    await storage.appliquerOperationCategorie({
      operation: "create",
      categorieId: "dddddddd-0000-4000-8000-000000000001",
      nom: "Catégorie témoin PG",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(storage.migrer()).resolves.toBeUndefined();
    await expect(storage.migrer()).resolves.toBeUndefined(); // une troisième fois, pour faire bonne mesure

    const categories = await storage.listerCategoriesActives();
    expect(categories).toEqual([expect.objectContaining({ nom: "Catégorie témoin PG" })]); // toujours UNE SEULE ligne
    await storage.fermer();
  });
});
