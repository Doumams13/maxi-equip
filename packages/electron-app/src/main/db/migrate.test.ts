import { describe, it, expect } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations, executerSchemaDeFaconTolerante } from "./migrate.js";

/**
 * Tests de régression pour le bug réel rencontré lors du test
 * d'installation indépendant (Phase 6C) : "no such column: modele_id" au
 * démarrage sur une base existante créée avant l'ajout de la colonne
 * `modele_id` — `CREATE INDEX ... ON produits (modele_id)` placée
 * directement dans schema.sql échouait avant que la migration
 * incrémentale correspondante n'ait pu ajouter la colonne, bloquant
 * l'ouverture de toute l'application.
 *
 * Vraie base SQLite en mémoire (jamais un dépôt mocké), comme
 * syncService.test.ts — `runMigrations` ne dépend d'aucun composant
 * Electron (le chiffrement SQLCipher est appliqué séparément par
 * db/index.ts, jamais par ce module).
 */

describe("runMigrations — résilience générale sur une base ancienne (§ régression modele_id)", () => {
  it("ne plante jamais si une table existante n'a pas encore une colonne indexée dans schema.sql (reproduction réelle : produits sans modele_id)", () => {
    const db = new Database(":memory:");

    // Simule une base créée AVANT la fonctionnalité "modèles multi-format" :
    // `produits` et `images_produit` existent déjà, dans leur forme
    // d'ORIGINE (sans modele_id, images liées par produit_id).
    db.exec(`
      CREATE TABLE produits (
        id TEXT PRIMARY KEY,
        motif TEXT NOT NULL,
        type TEXT NOT NULL,
        taille TEXT NOT NULL,
        taille_tri REAL NOT NULL,
        reference TEXT NOT NULL,
        prix INTEGER NOT NULL,
        seuil_alerte INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_produits_reference_actif ON produits (reference) WHERE deleted_at IS NULL;
      INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, created_at, updated_at)
        VALUES ('p1', 'Marbre Blanc', 'Faience', '60x60', 3600, 'MB-6060', 15000, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

      CREATE TABLE images_produit (
        id TEXT PRIMARY KEY,
        produit_id TEXT NOT NULL REFERENCES produits (id),
        kind TEXT NOT NULL,
        chemin_local TEXT NOT NULL,
        url_cloud TEXT,
        ordre INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO images_produit (id, produit_id, kind, chemin_local, sync_status, created_at, updated_at)
        VALUES ('img1', 'p1', 'produit', '/tmp/img1.png', 'confirmed', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
    `);

    // Doit se terminer SANS exception — c'est exactement ce qui plantait
    // avant la correction (schema.sql exécuté en un seul lot).
    expect(() => runMigrations(db)).not.toThrow();

    // La colonne est bien ajoutée et l'index bien créé après coup.
    const colonnes = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
    expect(colonnes.some((c) => c.name === "modele_id")).toBe(true);

    const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_produits_modele_id'").get();
    expect(index).toBeDefined();

    // Le produit existant a bien été rattaché à un modèle créé pour lui.
    const produit = db.prepare("SELECT modele_id FROM produits WHERE id = 'p1'").get() as { modele_id: string | null };
    expect(produit.modele_id).not.toBeNull();

    // L'image existante a bien été migrée vers le modèle (plus vers le produit).
    const image = db.prepare("SELECT modele_id FROM images_produit WHERE id = 'img1'").get() as { modele_id: string };
    expect(image.modele_id).toBe(produit.modele_id);

    // Aucune donnée perdue.
    expect((db.prepare("SELECT COUNT(*) as n FROM produits").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) as n FROM images_produit").get() as { n: number }).n).toBe(1);

    db.close();
  });

  it("une base réellement neuve continue de fonctionner normalement (aucune régression du chemin d'installation fraîche)", () => {
    const db = new Database(":memory:");
    expect(() => runMigrations(db)).not.toThrow();
    const colonnes = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
    expect(colonnes.some((c) => c.name === "modele_id")).toBe(true);
    db.close();
  });
});

describe("executerSchemaDeFaconTolerante — comportement général, peu importe la table (§ régression)", () => {
  it("ignore une CREATE INDEX qui échoue avec 'no such column', sans bloquer les instructions suivantes", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE une_table_ancienne (id TEXT PRIMARY KEY);");

    const schemaSynthetique = `
      CREATE TABLE IF NOT EXISTS une_table_ancienne (id TEXT PRIMARY KEY, colonne_recente TEXT);
      CREATE INDEX IF NOT EXISTS idx_une_table_ancienne_colonne_recente ON une_table_ancienne (colonne_recente);
      CREATE TABLE IF NOT EXISTS une_autre_table (id TEXT PRIMARY KEY);
    `;

    expect(() => executerSchemaDeFaconTolerante(db, schemaSynthetique)).not.toThrow();

    // La table suivante, après l'instruction fautive, a bien été créée —
    // la classe de bug ("tout le lot bloqué par une seule ligne") est
    // corrigée pour N'IMPORTE QUELLE table, pas seulement produits.
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='une_autre_table'").get();
    expect(table).toBeDefined();

    // L'index n'a PAS été créé (la colonne n'existe pas) — c'est
    // volontaire : une migration incrémentale dédiée doit s'en charger
    // après avoir ajouté la colonne, jamais cette fonction générique.
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_une_table_ancienne_colonne_recente'").get();
    expect(index).toBeUndefined();

    db.close();
  });

  it("laisse remonter toute autre erreur qu'un 'no such column' sur un CREATE INDEX (ne masque jamais un vrai bug)", () => {
    const db = new Database(":memory:");
    const schemaInvalide = "CREATE TABLE tvalide (id TEXT PRIMARY KEY); CECI_NEST_PAS_DU_SQL_VALIDE;";
    expect(() => executerSchemaDeFaconTolerante(db, schemaInvalide)).toThrow();
    db.close();
  });

  it("laisse remonter une erreur de colonne absente qui ne vient PAS d'un CREATE INDEX", () => {
    const db = new Database(":memory:");
    const schemaInvalide = "CREATE TABLE t (id TEXT PRIMARY KEY); INSERT INTO t (id, colonne_absente) VALUES ('x', 'y');";
    expect(() => executerSchemaDeFaconTolerante(db, schemaInvalide)).toThrow(/no column named/);
    db.close();
  });
});

// ─── Régression : recréations de table ne doivent plus jamais perdre ────────
// une colonne ajoutée après l'écriture de leur liste — audit "check up
// complet". Reproduit une base qui porte à la fois l'ANCIENNE contrainte
// déclenchant la recréation ET une colonne plus récente déjà renseignée :
// avant la correction, cette colonne était silencieusement effacée par la
// recréation (liste de colonnes figée, jamais mise à jour).

describe("fixReferenceUniqueConstraint — ne perd jamais modele_id lors de la recréation", () => {
  it("conserve modele_id d'un produit déjà lié à un modèle", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE modeles_produit (
        id TEXT PRIMARY KEY, motif TEXT NOT NULL, type TEXT NOT NULL,
        deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO modeles_produit (id, motif, type, created_at, updated_at)
        VALUES ('modele-1', 'Marbre Blanc', 'Faience', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

      CREATE TABLE produits (
        id TEXT PRIMARY KEY,
        modele_id TEXT REFERENCES modeles_produit (id),
        motif TEXT NOT NULL,
        type TEXT NOT NULL,
        taille TEXT NOT NULL,
        taille_tri REAL NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        prix INTEGER NOT NULL,
        seuil_alerte INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO produits (id, modele_id, motif, type, taille, taille_tri, reference, prix, created_at, updated_at)
        VALUES ('p1', 'modele-1', 'Marbre Blanc', 'Faience', '60x60', 3600, 'MB-6060', 15000, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
    `);

    expect(() => runMigrations(db)).not.toThrow();

    const produit = db.prepare("SELECT modele_id FROM produits WHERE id = 'p1'").get() as { modele_id: string | null };
    expect(produit.modele_id).toBe("modele-1");
    db.close();
  });
});

describe("migrateFacturesPourAnnulationEtLivraison — ne perd jamais identite_snapshot_json lors de la recréation", () => {
  it("conserve identite_snapshot_json déjà renseigné", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE emplacements (id TEXT PRIMARY KEY, nom TEXT NOT NULL);
      INSERT INTO emplacements (id, nom) VALUES ('e1', 'SHOP');
      CREATE TABLE utilisateurs (id TEXT PRIMARY KEY, nom TEXT NOT NULL);
      INSERT INTO utilisateurs (id, nom) VALUES ('u1', 'Admin');

      CREATE TABLE factures (
        id TEXT PRIMARY KEY,
        numero TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        emplacement_id TEXT NOT NULL REFERENCES emplacements (id),
        client_nom TEXT NOT NULL,
        client_telephone TEXT,
        client_adresse TEXT,
        vendeur_utilisateur_id TEXT NOT NULL REFERENCES utilisateurs (id),
        vendeur_nom_manuel TEXT,
        total INTEGER NOT NULL,
        identite_snapshot_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, identite_snapshot_json, created_at, updated_at)
        VALUES ('f1', 'F-0001', '2025-01-01T00:00:00.000Z', 'e1', 'Client Test', 'u1', 50000, '{"nom":"MAXI-EQUIP"}', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
    `);

    expect(() => runMigrations(db)).not.toThrow();

    const facture = db.prepare("SELECT identite_snapshot_json FROM factures WHERE id = 'f1'").get() as { identite_snapshot_json: string | null };
    expect(facture.identite_snapshot_json).toBe('{"nom":"MAXI-EQUIP"}');
    db.close();
  });
});
