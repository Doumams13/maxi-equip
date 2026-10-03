// Lance electron-builder en signant automatiquement l'exe Windows si un
// certificat de signature de code est configuré localement (voir
// installer-resources/codesign.config.json, jamais commité — contient un
// mot de passe de clé privée). Sans ce fichier, le build continue sans
// signature (utile sur une machine qui n'a pas le certificat) plutôt que
// d'échouer.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const configPath = path.join(__dirname, "..", "installer-resources", "codesign.config.json");

if (fs.existsSync(configPath)) {
  const { certificateFile, certificatePassword } = JSON.parse(fs.readFileSync(configPath, "utf8"));
  process.env.CSC_LINK = path.resolve(path.dirname(configPath), certificateFile);
  process.env.CSC_KEY_PASSWORD = certificatePassword;
  console.log(`[build-signed] Signature activée avec ${process.env.CSC_LINK}`);
} else {
  console.warn(
    `[build-signed] ${configPath} introuvable — build SANS signature de code (voir installer-resources/codesign.config.json.example).`,
  );
}

// "--publish never" : génère quand même latest.yml (présence de
// `build.publish` dans package.json, nécessaire pour electron-updater)
// SANS tenter un envoi réseau automatique — le dépôt des fichiers sur le
// VPS reste un geste manuel/scp explicite (voir deploy/README.md),
// jamais un identifiant d'upload stocké sur ce poste.
const result = spawnSync("npx", ["electron-builder", "--win", "--x64", "--publish", "never"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
