import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Audit de sécurité spécifique à l'installation (Phase 6C, §12).
 *
 * Balaie récursivement le code source de l'application (jamais les
 * fichiers de test, qui contiennent légitimement des mots de passe
 * factices) à la recherche de motifs interdits : mécanisme de mot de
 * passe généré aléatoirement pour l'Administrateur (abandonné), mots de
 * passe/secrets codés en dur, écriture de identifiants dans un fichier
 * ou un log.
 *
 * Test de RÉGRESSION : garantit qu'aucun changement futur ne
 * réintroduit silencieusement l'ancien mécanisme `bootstrapUsers`
 * (mot de passe aléatoire, compte Gérant créé automatiquement, fichier
 * d'identifiants écrit sur disque).
 */

const SRC_MAIN_DIR = fileURLToPath(new URL("..", import.meta.url));
const SRC_PRELOAD_DIR = fileURLToPath(new URL("../../preload", import.meta.url));

function listerFichiersSource(dir: string): string[] {
  const resultats: string[] = [];
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    const stat = statSync(chemin);
    if (stat.isDirectory()) {
      resultats.push(...listerFichiersSource(chemin));
      continue;
    }
    if ((extname(chemin) === ".ts" || extname(chemin) === ".tsx") && !chemin.endsWith(".test.ts") && !chemin.endsWith(".test.tsx")) {
      resultats.push(chemin);
    }
  }
  return resultats;
}

const FICHIERS_SOURCE = [...listerFichiersSource(SRC_MAIN_DIR), ...listerFichiersSource(SRC_PRELOAD_DIR)];

describe("Audit de sécurité installation (§12) — code source Main + Preload", () => {
  it("aucun fichier ne réintroduit le mécanisme de mot de passe aléatoire abandonné", () => {
    const motifsInterdits = [
      /genererMotDePasseInitial/,
      /bootstrapDefaultUsers/,
      /IdentifiantsInitiaux/,
      /COMPTES_PAR_DEFAUT/,
      /afficherIdentifiantsInitiaux/,
    ];
    for (const fichier of FICHIERS_SOURCE) {
      const contenu = readFileSync(fichier, "utf-8");
      for (const motif of motifsInterdits) {
        expect(contenu, `${fichier} ne doit pas contenir ${motif}`).not.toMatch(motif);
      }
    }
  });

  it("aucun fichier n'écrit un fichier ou un log contenant un mot de passe", () => {
    for (const fichier of FICHIERS_SOURCE) {
      const contenu = readFileSync(fichier, "utf-8");
      const ecritDesIdentifiants = /writeFileSync\([^)]*[Ii]dentifiant/;
      expect(contenu, `${fichier} ne doit pas écrire d'identifiants sur disque`).not.toMatch(ecritDesIdentifiants);

      const loggeMotDePasse = /console\.(log|info|warn|error)\([^)]*[Mm]ot[Dd]ePasse/;
      expect(contenu, `${fichier} ne doit jamais journaliser un mot de passe`).not.toMatch(loggeMotDePasse);
    }
  });

  it("aucun mot de passe/secret par défaut codé en dur (motif classique) n'est présent", () => {
    const motifsSecrets = [/admin123/i, /password123/i, /motdepasse123/i, /['"]admin['"]\s*:\s*['"]admin['"]/i];
    for (const fichier of FICHIERS_SOURCE) {
      const contenu = readFileSync(fichier, "utf-8");
      for (const motif of motifsSecrets) {
        expect(contenu, `${fichier} ne doit pas contenir de secret par défaut codé en dur`).not.toMatch(motif);
      }
    }
  });

  it("le script NSIS de désinstallation ne contient aucun appel réseau (jamais de suppression cloud)", () => {
    const cheminNsh = fileURLToPath(new URL("../../../installer-resources/installer.nsh", import.meta.url));
    const contenu = readFileSync(cheminNsh, "utf-8");
    expect(contenu).not.toMatch(/NSISdl|inetc|http:\/\/|https:\/\//i);
  });

  it("setup:creerAdmin ne transite jamais par une variable d'environnement ou un argument CLI", () => {
    const setupTs = readFileSync(join(SRC_MAIN_DIR, "ipc", "setup.ts"), "utf-8");
    expect(setupTs).not.toMatch(/process\.env/);
    expect(setupTs).not.toMatch(/process\.argv/);
  });
});
