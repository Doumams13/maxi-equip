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

describe("Fondations quincaillerie (Phase 1) — categories/sous_categories, unite_vente, caracteristiques", () => {
  it("sur une base neuve : les tables categories/sous_categories/sous_categorie_champs existent, et 'Carrelage et revêtements' > 'Carreaux' a été créée par défaut", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('categories','sous_categories','sous_categorie_champs')").all();
    expect(tables).toHaveLength(3);

    const categorie = db.prepare("SELECT id FROM categories WHERE nom = 'Carrelage et revêtements' AND deleted_at IS NULL").get() as { id: string } | undefined;
    expect(categorie).toBeDefined();
    const sousCategorie = db.prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = 'Carreaux'").get(categorie!.id) as { id: string } | undefined;
    expect(sousCategorie).toBeDefined();

    const colonnesProduits = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
    expect(colonnesProduits.some((c) => c.name === "unite_vente")).toBe(true);
    expect(colonnesProduits.some((c) => c.name === "caracteristiques")).toBe(true);
    db.close();
  });

  it("COMPATIBILITÉ DONNÉES EXISTANTES : un modèle/produit créé AVANT cette évolution (sans sous_categorie_id ni unite_vente) est rattaché automatiquement à 'Carrelage et revêtements' > 'Carreaux', et conserve toutes ses données intactes", () => {
    const db = new Database(":memory:");
    // Simule une base créée AVANT l'extension quincaillerie : modeles_produit
    // et produits existent déjà, dans leur forme d'avant (sans les nouvelles colonnes).
    db.exec(`
      CREATE TABLE modeles_produit (
        id TEXT PRIMARY KEY,
        motif TEXT NOT NULL,
        type TEXT NOT NULL,
        ordre_vitrine INTEGER,
        deleted_at TEXT,
        deleted_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE produits (
        id TEXT PRIMARY KEY,
        modele_id TEXT REFERENCES modeles_produit (id),
        motif TEXT NOT NULL,
        type TEXT NOT NULL,
        taille TEXT NOT NULL,
        taille_tri REAL NOT NULL,
        largeur REAL,
        hauteur REAL,
        reference TEXT NOT NULL,
        prix INTEGER NOT NULL,
        carreaux_par_carton INTEGER,
        seuil_alerte INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO modeles_produit (id, motif, type, ordre_vitrine, created_at, updated_at)
        VALUES ('m1', 'Marbre Blanc', 'Grès cérame', NULL, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO produits (id, modele_id, motif, type, taille, taille_tri, largeur, hauteur, reference, prix, carreaux_par_carton, seuil_alerte, created_at, updated_at)
        VALUES ('p1', 'm1', 'Marbre Blanc', 'Grès cérame', '60x60', 60, 60, 60, 'REF-001', 15000, 4, 10, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
    `);

    expect(() => runMigrations(db)).not.toThrow();

    // Le produit existant n'a pas bougé : prix/référence/carreauxParCarton intacts.
    const produit = db.prepare("SELECT reference, prix, carreaux_par_carton, unite_vente, caracteristiques FROM produits WHERE id = 'p1'").get() as {
      reference: string;
      prix: number;
      carreaux_par_carton: number;
      unite_vente: string | null;
      caracteristiques: string | null;
    };
    expect(produit.reference).toBe("REF-001");
    expect(produit.prix).toBe(15000);
    expect(produit.carreaux_par_carton).toBe(4);
    expect(produit.unite_vente).toBeNull(); // interprété comme "carton" côté app, jamais réinterprété ici.
    expect(produit.caracteristiques).toBeNull();

    // Le modèle existant a été rattaché à la catégorie par défaut, jamais laissé "non classé".
    const modele = db.prepare("SELECT sous_categorie_id FROM modeles_produit WHERE id = 'm1'").get() as { sous_categorie_id: string | null };
    expect(modele.sous_categorie_id).not.toBeNull();
    const sousCategorie = db.prepare("SELECT nom FROM sous_categories WHERE id = ?").get(modele.sous_categorie_id) as { nom: string };
    expect(sousCategorie.nom).toBe("Carreaux");
    db.close();
  });

  it("IDEMPOTENCE : exécuter runMigrations plusieurs fois ne crée jamais une seconde catégorie 'Carrelage et revêtements', et ne touche jamais un modèle déjà classé manuellement", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    // Classement manuel d'un modèle vers une AUTRE sous-catégorie, simulant un choix utilisateur.
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES ('cat-plomberie', 'Plomberie et évacuation', NULL, 1, NULL, NULL, ?, ?)"
    ).run(now, now);
    db.prepare(
      "INSERT INTO sous_categories (id, categorie_id, nom, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES ('sc-tuyaux', 'cat-plomberie', 'Tuyaux', 0, NULL, NULL, ?, ?)"
    ).run(now, now);
    db.prepare(
      "INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, created_at, updated_at) VALUES ('m-tuyau', 'Tuyau PVC', 'Plomberie', 'sc-tuyaux', ?, ?)"
    ).run(now, now);

    runMigrations(db);
    runMigrations(db);

    const categoriesCarrelage = db.prepare("SELECT COUNT(*) as n FROM categories WHERE nom = 'Carrelage et revêtements'").get() as { n: number };
    expect(categoriesCarrelage.n).toBe(1);

    const modeleTuyau = db.prepare("SELECT sous_categorie_id FROM modeles_produit WHERE id = 'm-tuyau'").get() as { sous_categorie_id: string };
    expect(modeleTuyau.sous_categorie_id).toBe("sc-tuyaux"); // jamais réécrit.
    db.close();
  });

  it("FILET DE SÉCURITÉ : un modèle créé sans sous-catégorie (après la migration initiale) est rattaché à 'Divers' > 'Non classé', jamais laissé invisible", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const now = new Date().toISOString();
    db.prepare("INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, created_at, updated_at) VALUES ('m-orphelin', 'Produit import', 'Divers', NULL, ?, ?)").run(
      now,
      now
    );

    runMigrations(db);

    const modele = db.prepare("SELECT sous_categorie_id FROM modeles_produit WHERE id = 'm-orphelin'").get() as { sous_categorie_id: string };
    const sousCategorie = db.prepare("SELECT nom, categorie_id FROM sous_categories WHERE id = ?").get(modele.sous_categorie_id) as { nom: string; categorie_id: string };
    expect(sousCategorie.nom).toBe("Non classé");
    const categorie = db.prepare("SELECT nom FROM categories WHERE id = ?").get(sousCategorie.categorie_id) as { nom: string };
    expect(categorie.nom).toBe("Divers");

    // Ré-exécuter ne crée jamais une seconde catégorie/sous-catégorie "Divers"/"Non classé".
    runMigrations(db);
    const comptageDivers = db.prepare("SELECT COUNT(*) as n FROM categories WHERE nom = 'Divers'").get() as { n: number };
    expect(comptageDivers.n).toBe(1);
    db.close();
  });

  it("RÉGRESSION diagnostic '130 carreaux, 1 seul affiché' (2026-11-18) : des modèles legacy sont tout de même rattachés à 'Carrelage et revêtements' > 'Carreaux' même si la table categories contient déjà une AUTRE catégorie avant le premier passage (reproduction de l'ancien bug de garde)", () => {
    const db = new Database(":memory:");

    // Simule une base créée AVANT l'extension quincaillerie : modeles_produit
    // existe déjà, avec des modèles jamais classés (comme les anciens carreaux
    // enregistrés avant la colonne sous_categorie_id).
    db.exec(`
      CREATE TABLE modeles_produit (
        id TEXT PRIMARY KEY, motif TEXT NOT NULL, type TEXT NOT NULL,
        deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    const ancien = "2026-01-01T00:00:00.000Z";
    for (let i = 0; i < 3; i++) {
      db.prepare("INSERT INTO modeles_produit (id, motif, type, created_at, updated_at) VALUES (?, ?, 'Grès cérame', ?, ?)").run(
        `m-legacy-${i}`,
        `Carreau legacy ${i}`,
        ancien,
        ancien
      );
    }

    // Reproduit l'ancien déclencheur du bug : une catégorie SANS RAPPORT avec
    // les carreaux existe déjà (ex. reçue via le référentiel commun) AVANT
    // que cette base n'ait jamais exécuté la migration Phase 1 une seule
    // fois — l'ancienne garde `COUNT(*) FROM categories === 0` sautait alors
    // la classification par défaut à tort.
    db.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY, nom TEXT NOT NULL, image_data_url TEXT, ordre INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO categories (id, nom, ordre, created_at, updated_at) VALUES ('cat-etrangere', 'Plomberie et évacuation', 1, ?, ?)"
    ).run(ancien, ancien);

    runMigrations(db);

    const modeles = db.prepare("SELECT sous_categorie_id FROM modeles_produit WHERE id LIKE 'm-legacy-%'").all() as { sous_categorie_id: string }[];
    expect(modeles).toHaveLength(3);
    for (const m of modeles) {
      const sousCategorie = db.prepare("SELECT nom, categorie_id FROM sous_categories WHERE id = ?").get(m.sous_categorie_id) as
        | { nom: string; categorie_id: string }
        | undefined;
      expect(sousCategorie?.nom).toBe("Carreaux"); // jamais "Non classé" : la présence d'une AUTRE catégorie ne doit plus jamais faire sauter ce rattachement.
      const categorie = db.prepare("SELECT nom FROM categories WHERE id = ?").get(sousCategorie!.categorie_id) as { nom: string };
      expect(categorie.nom).toBe("Carrelage et revêtements");
    }
    db.close();
  });

  it("lignes_facture gagne unite_vente/caracteristiques sur une base existante, sans perdre les snapshots déjà présents (surface_carton_m2)", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE utilisateurs (id TEXT PRIMARY KEY, nom TEXT NOT NULL, identifiant TEXT NOT NULL, hash_mot_de_passe TEXT NOT NULL, role TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE emplacements (id TEXT PRIMARY KEY, nom TEXT NOT NULL, type TEXT NOT NULL, ville TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE factures (
        id TEXT PRIMARY KEY, numero TEXT NOT NULL, date TEXT NOT NULL, emplacement_id TEXT NOT NULL REFERENCES emplacements (id),
        client_nom TEXT NOT NULL, vendeur_utilisateur_id TEXT NOT NULL REFERENCES utilisateurs (id), total INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE lignes_facture (
        id TEXT PRIMARY KEY, facture_id TEXT NOT NULL REFERENCES factures (id), produit_id TEXT,
        motif TEXT NOT NULL, reference TEXT, taille TEXT NOT NULL, quantite INTEGER NOT NULL,
        prix_unitaire INTEGER NOT NULL, surface_carton_m2 REAL
      );
      INSERT INTO utilisateurs (id, nom, identifiant, hash_mot_de_passe, role, created_at, updated_at) VALUES ('u1', 'Admin', 'admin', 'x', 'administrateur', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO emplacements (id, nom, type, ville, created_at, updated_at) VALUES ('e1', 'Shop', 'shop', 'Libreville', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, created_at, updated_at)
        VALUES ('f1', 'F-0001', '2025-01-01T00:00:00.000Z', 'e1', 'Client Test', 'u1', 15000, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO lignes_facture (id, facture_id, motif, taille, quantite, prix_unitaire, surface_carton_m2)
        VALUES ('l1', 'f1', 'Marbre Blanc', '60x60', 2, 15000, 1.44);
    `);

    expect(() => runMigrations(db)).not.toThrow();

    const ligne = db.prepare("SELECT surface_carton_m2, unite_vente, caracteristiques FROM lignes_facture WHERE id = 'l1'").get() as {
      surface_carton_m2: number;
      unite_vente: string | null;
      caracteristiques: string | null;
    };
    expect(ligne.surface_carton_m2).toBe(1.44); // jamais perdu.
    expect(ligne.unite_vente).toBeNull();
    expect(ligne.caracteristiques).toBeNull();
    db.close();
  });
});

/**
 * Initialisation du catalogue quincaillerie (2026-11-15) — les 20
 * catégories visuelles de la 0.11.1, leurs sous-catégories et leurs
 * champs suggérés, repris du prototype. Vraie base SQLite en mémoire,
 * comme les autres suites de ce fichier.
 */
describe("runMigrations — initialisation des 20 catégories quincaillerie prédéfinies", () => {
  it("crée les 20 catégories et leurs sous-catégories sur une base neuve, sans inventer de produit", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const categories = db.prepare("SELECT nom, ordre FROM categories WHERE deleted_at IS NULL").all() as { nom: string; ordre: number }[];
    expect(categories).toHaveLength(20); // "Divers" créé ici (aucun produit non classé sur une base neuve) ; "Carrelage et revêtements" par l'autre migration, reconnu par nom.
    const noms = categories.map((c) => c.nom);
    for (const attendu of [
      "Carrelage et revêtements", "Matériaux de construction", "Sanitaires et toilettes", "Plomberie et évacuation",
      "Électricité", "Éclairage", "Peinture et décoration", "Bois et menuiserie", "Couverture et toiture",
      "Visserie et fixation", "Outillage manuel", "Outillage électrique", "Accessoires de pose",
      "Étanchéité et isolation", "Équipements de protection", "Jardinage et espaces extérieurs",
      "Portes et fenêtres", "Chimie du bâtiment", "Climatisation et ventilation", "Divers",
    ]) {
      expect(noms).toContain(attendu);
    }

    const carrelage = categories.find((c) => c.nom === "Carrelage et revêtements")!;
    expect(carrelage.ordre).toBe(0); // jamais réordonnée : déjà créée à l'ordre 0 par l'autre migration.

    const carrelageId = (db.prepare("SELECT id FROM categories WHERE nom = ?").get("Carrelage et revêtements") as { id: string }).id;
    const sousCatsCarrelage = db
      .prepare("SELECT nom FROM sous_categories WHERE categorie_id = ? AND deleted_at IS NULL")
      .all(carrelageId) as { nom: string }[];
    // "Carreaux" (autre migration) + les 3 sous-catégories prédéfinies — jamais remplacée, seulement complétée.
    expect(sousCatsCarrelage.map((s) => s.nom)).toEqual(
      expect.arrayContaining(["Carreaux", "Revêtements muraux", "Colles et joints carrelage", "Plinthes et profilés"])
    );

    const plomberieId = (db.prepare("SELECT id FROM categories WHERE nom = ?").get("Plomberie et évacuation") as { id: string }).id;
    expect(db.prepare("SELECT COUNT(*) as n FROM sous_categories WHERE categorie_id = ?").get(plomberieId)).toEqual({ n: 8 });

    // Champs suggérés : "Tuyaux" (Plomberie) fait partie des 5 sous-catégories avec champs d'exemple.
    const tuyauxId = (db.prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = 'Tuyaux'").get(plomberieId) as { id: string }).id;
    const champsTuyaux = db.prepare("SELECT nom FROM sous_categorie_champs WHERE sous_categorie_id = ? ORDER BY ordre").all(tuyauxId) as { nom: string }[];
    expect(champsTuyaux.map((c) => c.nom)).toEqual(["Matière", "Diamètre", "Longueur", "Pression nominale"]);

    // "Carreaux" existe déjà (autre migration) — les champs suggérés doivent s'y rattacher correctement.
    const carreauxId = (db.prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = 'Carreaux'").get(carrelageId) as { id: string }).id;
    const champsCarreaux = db.prepare("SELECT nom FROM sous_categorie_champs WHERE sous_categorie_id = ?").all(carreauxId) as { nom: string }[];
    expect(champsCarreaux.map((c) => c.nom)).toEqual(expect.arrayContaining(["Matière", "Finition", "Couleur"]));

    // Aucun produit/stock/mouvement fictif créé par cette migration.
    expect((db.prepare("SELECT COUNT(*) as n FROM modeles_produit").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) as n FROM produits").get() as { n: number }).n).toBe(0);

    db.close();
  });

  it("est idempotente — un second passage ne duplique ni catégorie, ni sous-catégorie, ni champ suggéré", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const categoriesAvant = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
    const sousCatsAvant = (db.prepare("SELECT COUNT(*) as n FROM sous_categories").get() as { n: number }).n;
    const champsAvant = (db.prepare("SELECT COUNT(*) as n FROM sous_categorie_champs").get() as { n: number }).n;

    runMigrations(db); // second démarrage de l'application, même base.

    expect((db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n).toBe(categoriesAvant);
    expect((db.prepare("SELECT COUNT(*) as n FROM sous_categories").get() as { n: number }).n).toBe(sousCatsAvant);
    expect((db.prepare("SELECT COUNT(*) as n FROM sous_categorie_champs").get() as { n: number }).n).toBe(champsAvant);
    db.close();
  });

  it("ne touche jamais une catégorie déjà personnalisée par l'utilisateur (image, ordre) ni ses sous-catégories manuelles", () => {
    const db = new Database(":memory:");
    executerSchemaDeFaconTolerante(db); // schéma seul, pas encore les données prédéfinies.

    // L'utilisateur a déjà créé/personnalisé "Électricité" avant cette migration : une image choisie, un ordre déjà fixé, et une sous-catégorie à lui ("Câblage spécial") qui ne fait pas partie de la liste prédéfinie.
    const now = new Date().toISOString();
    const catId = "cat-elec-manuelle";
    db.prepare(
      "INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, 'Électricité', 'data:image/png;base64,AAAA', 42, NULL, NULL, ?, ?)"
    ).run(catId, now, now);
    const sousCatId = "souscat-elec-manuelle";
    db.prepare(
      "INSERT INTO sous_categories (id, categorie_id, nom, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, 'Câblage spécial', 0, NULL, NULL, ?, ?)"
    ).run(sousCatId, catId, now, now);

    runMigrations(db);

    // La catégorie n'a pas été dupliquée, ni son image/ordre écrasés.
    const electriciteRows = db.prepare("SELECT id, image_data_url, ordre FROM categories WHERE nom = 'Électricité'").all() as {
      id: string; image_data_url: string | null; ordre: number;
    }[];
    expect(electriciteRows).toHaveLength(1);
    expect(electriciteRows[0]!.id).toBe(catId);
    expect(electriciteRows[0]!.image_data_url).toBe("data:image/png;base64,AAAA");
    expect(electriciteRows[0]!.ordre).toBe(42);

    // La sous-catégorie manuelle existe toujours, ET les sous-catégories prédéfinies ont été ajoutées à côté.
    const sousCats = db.prepare("SELECT nom FROM sous_categories WHERE categorie_id = ?").all(catId) as { nom: string }[];
    expect(sousCats.map((s) => s.nom)).toEqual(
      expect.arrayContaining(["Câblage spécial", "Câbles et fils", "Prises et interrupteurs", "Disjoncteurs et tableaux", "Goulottes et gaines", "Domotique"])
    );
    db.close();
  });
});

describe("Fondations quincaillerie (Phase 3 bis) — modele_physique, unites_configurees, sous_categorie_unites, champs typés", () => {
  it("sur une base neuve : seule 'Carreaux' a modele_physique='carreau', toutes les autres sous-catégories restent non restreintes (unites_configurees=0, modele_physique NULL)", () => {
    const db = new Database(":memory:");
    runMigrations(db);

    const carreaux = db.prepare("SELECT modele_physique, unites_configurees FROM sous_categories WHERE nom = 'Carreaux'").get() as {
      modele_physique: string | null;
      unites_configurees: number;
    };
    expect(carreaux.modele_physique).toBe("carreau");
    expect(carreaux.unites_configurees).toBe(0);

    const autres = db.prepare("SELECT COUNT(*) as n FROM sous_categories WHERE nom != 'Carreaux' AND (modele_physique IS NOT NULL OR unites_configurees != 0)").get() as {
      n: number;
    };
    expect(autres.n).toBe(0);

    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sous_categorie_unites'").get();
    expect(table).toBeDefined();

    const colonnesChamps = db.prepare("PRAGMA table_info(sous_categorie_champs)").all() as { name: string }[];
    for (const colonne of ["type", "obligatoire", "valeurs_autorisees", "unite_mesure", "role"]) {
      expect(colonnesChamps.some((c) => c.name === colonne)).toBe(true);
    }
    db.close();
  });

  it("COMPATIBILITÉ DONNÉES EXISTANTES : une base antérieure à cette évolution (sous_categories/sous_categorie_champs sans les nouvelles colonnes) migre sans perte, et les champs déjà suggérés prennent les valeurs par défaut neutres", () => {
    const db = new Database(":memory:");
    // Simule une base créée AVANT cette évolution : forme d'origine (Phase 1), sans les nouvelles colonnes.
    db.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY, nom TEXT NOT NULL, image_data_url TEXT, ordre INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE sous_categories (
        id TEXT PRIMARY KEY, categorie_id TEXT NOT NULL REFERENCES categories (id), nom TEXT NOT NULL, ordre INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE sous_categorie_champs (
        id TEXT PRIMARY KEY, sous_categorie_id TEXT NOT NULL REFERENCES sous_categories (id), nom TEXT NOT NULL, ordre INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO categories (id, nom, ordre, created_at, updated_at) VALUES ('cat1', 'Carrelage et revêtements', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO sous_categories (id, categorie_id, nom, ordre, created_at, updated_at) VALUES ('sc1', 'cat1', 'Carreaux', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO sous_categorie_champs (id, sous_categorie_id, nom, ordre, created_at, updated_at) VALUES ('champ1', 'sc1', 'Matière', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
    `);

    expect(() => runMigrations(db)).not.toThrow();

    const sousCategorie = db.prepare("SELECT modele_physique, unites_configurees FROM sous_categories WHERE id = 'sc1'").get() as {
      modele_physique: string | null;
      unites_configurees: number;
    };
    expect(sousCategorie.modele_physique).toBe("carreau"); // "Carreaux" préexistante, reconnue par son nom.
    expect(sousCategorie.unites_configurees).toBe(0);

    const champ = db.prepare("SELECT nom, type, obligatoire, valeurs_autorisees, unite_mesure, role FROM sous_categorie_champs WHERE id = 'champ1'").get() as {
      nom: string; type: string; obligatoire: number; valeurs_autorisees: string | null; unite_mesure: string | null; role: string | null;
    };
    expect(champ.nom).toBe("Matière"); // jamais perdu ni réinterprété.
    expect(champ.type).toBe("texte");
    expect(champ.obligatoire).toBe(0);
    expect(champ.valeurs_autorisees).toBeNull();
    expect(champ.unite_mesure).toBeNull();
    expect(champ.role).toBeNull();
    db.close();
  });

  it("IDEMPOTENCE : un second passage ne touche jamais une configuration d'unités déjà enregistrée par un administrateur", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const sousCategorie = db.prepare("SELECT id FROM sous_categories WHERE nom = 'Tuyaux'").get() as { id: string };
    db.prepare("UPDATE sous_categories SET unites_configurees = 1 WHERE id = ?").run(sousCategorie.id);
    db.prepare("INSERT INTO sous_categorie_unites (sous_categorie_id, unite_vente) VALUES (?, 'piece'), (?, 'metre')").run(sousCategorie.id, sousCategorie.id);

    runMigrations(db); // second démarrage de l'application, même base.

    const apres = db.prepare("SELECT unites_configurees FROM sous_categories WHERE id = ?").get(sousCategorie.id) as { unites_configurees: number };
    expect(apres.unites_configurees).toBe(1);
    const unites = db.prepare("SELECT unite_vente FROM sous_categorie_unites WHERE sous_categorie_id = ? ORDER BY unite_vente").all(sousCategorie.id) as { unite_vente: string }[];
    expect(unites.map((u) => u.unite_vente)).toEqual(["metre", "piece"]);
    db.close();
  });
});
