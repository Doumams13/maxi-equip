const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "test-encrypted.sqlite");
const CORRECT_KEY = "correct-horse-battery-staple";
const WRONG_KEY = "not-the-right-key";

function cleanup() {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
}

app.whenReady().then(() => {
  const results = {};
  try {
    cleanup();
    const Database = require("better-sqlite3-multiple-ciphers");
    results.require = "OK";

    // 1. Créer une base chiffrée et y écrire des données.
    const db1 = new Database(DB_PATH);
    db1.pragma(`key='${CORRECT_KEY}'`);
    db1.exec("CREATE TABLE produits (id INTEGER PRIMARY KEY, motif TEXT)");
    db1.exec("INSERT INTO produits (motif) VALUES ('Marbre Blanc')");
    db1.close();
    results.create_and_write = "OK";

    // 2. Le fichier sur disque ne doit PAS contenir le texte en clair.
    const rawBytes = fs.readFileSync(DB_PATH);
    const containsPlaintext = rawBytes.includes("Marbre Blanc");
    results.file_is_encrypted_on_disk = containsPlaintext ? "FAIL (texte en clair trouvé)" : "OK";

    // 3. Réouvrir avec la BONNE clé : doit réussir et lire la donnée.
    const db2 = new Database(DB_PATH);
    db2.pragma(`key='${CORRECT_KEY}'`);
    const row = db2.prepare("SELECT motif FROM produits WHERE id = 1").get();
    results.reopen_with_correct_key = row && row.motif === "Marbre Blanc" ? "OK" : "FAIL";
    db2.close();

    // 4. Réouvrir avec une MAUVAISE clé : doit échouer à lire.
    const db3 = new Database(DB_PATH);
    db3.pragma(`key='${WRONG_KEY}'`);
    try {
      db3.prepare("SELECT motif FROM produits WHERE id = 1").get();
      results.reopen_with_wrong_key_rejected = "FAIL (a pu lire avec une mauvaise clé !)";
    } catch (e) {
      results.reopen_with_wrong_key_rejected = "OK (lecture refusée : " + e.message + ")";
    }
    db3.close();

    console.log("RESULTS:", JSON.stringify(results, null, 2));
    console.log("ALL_OK");
  } catch (err) {
    console.error("FATAL_ERROR:", err && err.stack ? err.stack : err);
    console.log("PARTIAL_RESULTS:", JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    cleanup();
    app.exit();
  }
});
