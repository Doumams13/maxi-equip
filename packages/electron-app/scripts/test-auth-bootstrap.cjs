/**
 * Vérification automatisée de l'amorçage des comptes + authentification
 * réelle, avec la vraie base SQLite et le vrai hachage Argon2id.
 *
 * Ce script est volontairement autonome (comme test-sqlcipher.cjs) plutôt
 * que d'importer les modules TypeScript de l'application : il doit
 * s'exécuter via `electron scripts/test-auth-bootstrap.cjs --no-sandbox`
 * pour que le module natif SQLite (reconstruit pour l'ABI d'Electron via
 * electron-rebuild) se charge correctement — un exécuteur de tests
 * classique (Vitest sous Node, ou même Electron en mode
 * ELECTRON_RUN_AS_NODE) utilise une ABI différente et échouerait à
 * charger ce module (voir docs/architecture — limite déjà rencontrée).
 */
const { app } = require("electron");

app.whenReady().then(async () => {
  const results = {};
  try {
    const Database = require("better-sqlite3-multiple-ciphers");
    const { argon2id, argon2Verify } = require("hash-wasm");
    const crypto = require("crypto");

    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE utilisateurs (
        id TEXT PRIMARY KEY, nom TEXT, identifiant TEXT UNIQUE, password_hash TEXT,
        role TEXT, actif INTEGER, created_at TEXT, updated_at TEXT
      );
    `);

    async function hash(password) {
      const salt = crypto.randomBytes(16);
      return argon2id({ password, salt, parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: "encoded" });
    }

    const comptes = [
      { nom: "Administrateur", identifiant: "admin", motDePasse: "MaxiEquip2026!", role: "administrateur" },
      { nom: "Gérant", identifiant: "gerant", motDePasse: "MaxiEquip2026!", role: "gerant" },
    ];

    for (const c of comptes) {
      const passwordHash = await hash(c.motDePasse);
      db.prepare(
        `INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(crypto.randomUUID(), c.nom, c.identifiant, passwordHash, c.role, new Date().toISOString(), new Date().toISOString());
    }
    results.bootstrap_2_comptes = db.prepare("SELECT COUNT(*) as n FROM utilisateurs").get().n === 2 ? "OK" : "FAIL";

    const admin = db.prepare("SELECT * FROM utilisateurs WHERE identifiant = ?").get("admin");
    results.password_hash_pas_en_clair = !admin.password_hash.includes("MaxiEquip2026!") ? "OK" : "FAIL";
    results.format_argon2id = admin.password_hash.startsWith("$argon2id$") ? "OK" : "FAIL";

    const authOk = await argon2Verify({ password: "MaxiEquip2026!", hash: admin.password_hash });
    results.authentification_bon_mot_de_passe = authOk ? "OK" : "FAIL";

    const authFail = await argon2Verify({ password: "mauvais-mot-de-passe", hash: admin.password_hash });
    results.authentification_mauvais_mot_de_passe_rejete = !authFail ? "OK" : "FAIL";

    const gerant = db.prepare("SELECT * FROM utilisateurs WHERE identifiant = ?").get("gerant");
    results.role_gerant_correct = gerant.role === "gerant" ? "OK" : "FAIL";
    results.role_administrateur_correct = admin.role === "administrateur" ? "OK" : "FAIL";

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
