/**
 * Vérifie que la migration de la contrainte d'unicité de "reference"
 * fonctionne correctement sur une base simulant l'ANCIEN schéma (avec
 * l'ancienne contrainte UNIQUE bloquante), sans perte de données.
 * Exécuté via `electron` pour la bonne ABI du module natif SQLite.
 */
const { app } = require("electron");

app.whenReady().then(() => {
  const results = {};
  try {
    const Database = require("better-sqlite3-multiple-ciphers");
    const db = new Database(":memory:");

    // 1. Simule une base créée AVANT la correction (ancienne contrainte).
    db.exec(`
      CREATE TABLE produits (
        id TEXT PRIMARY KEY, motif TEXT NOT NULL, type TEXT NOT NULL, taille TEXT NOT NULL,
        taille_tri REAL NOT NULL, reference TEXT NOT NULL UNIQUE, prix INTEGER NOT NULL,
        seuil_alerte INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, deleted_by TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, deleted_at, deleted_by, created_at, updated_at)
       VALUES ('id-supprime', 'Ancien', 'T', '60x60 cm', 60, 'REF-001', 1000, 0, '2026-01-01T00:00:00Z', 'user-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run();
    db.prepare(
      `INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at)
       VALUES ('id-actif', 'Actif', 'T', '30x30 cm', 30, 'REF-002', 2000, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run();
    results.ancienne_base_simulee = "OK";

    // 2. Applique EXACTEMENT la même logique de migration que migrate.ts.
    function fixReferenceUniqueConstraint(db) {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'produits'").get();
      if (!row || !/reference\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql)) return;
      const migrer = db.transaction(() => {
        db.exec("PRAGMA foreign_keys = OFF");
        db.exec(`CREATE TABLE produits_nouveau (
          id TEXT PRIMARY KEY, motif TEXT NOT NULL, type TEXT NOT NULL, taille TEXT NOT NULL,
          taille_tri REAL NOT NULL, largeur REAL, hauteur REAL, reference TEXT NOT NULL,
          prix INTEGER NOT NULL, seuil_alerte INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, deleted_by TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );`);
        db.exec(`INSERT INTO produits_nouveau
          (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, deleted_at, deleted_by, created_at, updated_at)
          SELECT id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, deleted_at, deleted_by, created_at, updated_at FROM produits;`);
        db.exec("DROP TABLE produits;");
        db.exec("ALTER TABLE produits_nouveau RENAME TO produits;");
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_produits_reference_actif ON produits (reference) WHERE deleted_at IS NULL;");
        db.exec("PRAGMA foreign_keys = ON");
      });
      migrer();
    }
    fixReferenceUniqueConstraint(db);
    results.migration_executee = "OK";

    // 3. Vérifications.
    const count = db.prepare("SELECT COUNT(*) as n FROM produits").get().n;
    results.aucune_perte_de_donnees = count === 2 ? "OK" : `FAIL (${count} lignes, attendu 2)`;

    const ancien = db.prepare("SELECT * FROM produits WHERE id = 'id-supprime'").get();
    results.produit_supprime_toujours_trace = ancien && ancien.deleted_by === "user-1" ? "OK" : "FAIL";

    // Le vrai test : la référence de l'ancien produit supprimé doit maintenant être réutilisable.
    try {
      db.prepare(
        `INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at)
         VALUES ('id-nouveau', 'Nouveau', 'T', '90x90 cm', 90, 'REF-001', 3000, 0, '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z')`
      ).run();
      results.reference_reutilisable_apres_suppression = "OK";
    } catch (err) {
      results.reference_reutilisable_apres_suppression = `FAIL (${err.message})`;
    }

    // La contrainte doit rester active entre deux produits ACTIFS.
    try {
      db.prepare(
        `INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at)
         VALUES ('id-doublon', 'Doublon', 'T', '90x90 cm', 90, 'REF-002', 3000, 0, '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z')`
      ).run();
      results.contrainte_toujours_active_entre_actifs = "FAIL (doublon accepté à tort)";
    } catch {
      results.contrainte_toujours_active_entre_actifs = "OK";
    }

    db.close();
    console.log("RESULTS:", JSON.stringify(results, null, 2));
    const allOk = Object.values(results).every((v) => v === "OK");
    console.log(allOk ? "ALL_OK" : "SOME_FAILED");
    if (!allOk) process.exitCode = 1;
  } catch (err) {
    console.error("FATAL_ERROR:", err && err.stack ? err.stack : err);
    console.log("PARTIAL_RESULTS:", JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    app.exit();
  }
});
