#!/usr/bin/env node
/**
 * Contrôle automatisé des règles d'isolation du monorepo (Corrections §9) :
 *
 *  1. domain, shared-types et design-system ne dépendent JAMAIS de
 *     electron-app, api ou site.
 *  2. Aucun import croisé direct entre electron-app, api et site.
 *
 * Ce script scanne les fichiers source (.ts/.tsx) de chaque package et
 * signale toute ligne d'import qui violerait ces règles. Il est conçu
 * pour échouer bruyamment (code de sortie non nul) plutôt que d'espérer
 * une convention respectée par discipline.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PACKAGES_DIR = join(ROOT, "packages");

/** Packages qui ne doivent JAMAIS importer les surfaces applicatives. */
const FOUNDATION_PACKAGES = ["domain", "shared-types", "design-system"];
/** Surfaces applicatives, isolées les unes des autres. */
const SURFACE_PACKAGES = ["electron-app", "api", "site"];

const IMPORT_RE =
  /(?:from\s+["']|require\(\s*["']|import\(\s*["']|^\s*import\s+["'])(@maxi-equip\/[a-z-]+)/gm;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "dist-main" ||
      entry === ".next" ||
      entry === "build"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

function packageNameFromImport(spec) {
  return spec.replace("@maxi-equip/", "");
}

let violations = [];

for (const pkgFolder of readdirSync(PACKAGES_DIR)) {
  const pkgPath = join(PACKAGES_DIR, pkgFolder);
  if (!statSync(pkgPath).isDirectory()) continue;

  const files = walk(pkgPath);
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    let match;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const importedPkg = packageNameFromImport(match[1]);
      const relFile = relative(ROOT, file);

      // Règle 1 : un package "fondation" ne doit jamais importer une surface.
      if (FOUNDATION_PACKAGES.includes(pkgFolder) && SURFACE_PACKAGES.includes(importedPkg)) {
        violations.push(
          `${relFile} : le package fondation "${pkgFolder}" importe la surface "${importedPkg}" (interdit).`
        );
      }

      // Règle 2 : aucun import croisé direct entre surfaces applicatives.
      if (
        SURFACE_PACKAGES.includes(pkgFolder) &&
        SURFACE_PACKAGES.includes(importedPkg) &&
        importedPkg !== pkgFolder
      ) {
        violations.push(
          `${relFile} : la surface "${pkgFolder}" importe directement la surface "${importedPkg}" (interdit — passer par un package partagé).`
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error("❌ Violations des règles d'isolation du monorepo :\n");
  for (const v of violations) console.error("  - " + v);
  console.error(`\n${violations.length} violation(s) détectée(s).`);
  process.exit(1);
} else {
  console.log("✅ Règles d'isolation respectées : aucun import interdit détecté.");
}
