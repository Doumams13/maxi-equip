import type Database from "better-sqlite3-multiple-ciphers";
// Importé comme texte brut par le bundler (Vite/electron-vite) — voir electron.vite.config.ts.
import schemaSql from "./schema.sql?raw";

/**
 * Applique le schéma initial (idempotent — CREATE TABLE IF NOT EXISTS),
 * puis les évolutions de schéma ultérieures, elles aussi idempotentes et
 * jamais destructrices (§14 du prompt Phase 0 : "ne détruit aucune donnée
 * existante").
 */
export function runMigrations(db: Database.Database): void {
  db.exec(schemaSql);
  addEstPrincipaleColumnIfMissing(db);
}

/**
 * Correction Phase 2 (gestion des images produits) : ajoute la colonne
 * `est_principale` à une base créée avant cette évolution — sans jamais
 * recréer la table ni perdre les images déjà associées à des produits.
 */
function addEstPrincipaleColumnIfMissing(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(images_produit)").all() as { name: string }[];
  const hasColumn = columns.some((c) => c.name === "est_principale");
  if (!hasColumn) {
    db.exec("ALTER TABLE images_produit ADD COLUMN est_principale INTEGER NOT NULL DEFAULT 0");
  }
}
