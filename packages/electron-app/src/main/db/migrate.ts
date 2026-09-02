import type Database from "better-sqlite3-multiple-ciphers";
// Importé comme texte brut par le bundler (Vite/electron-vite) — voir electron.vite.config.ts.
import schemaSql from "./schema.sql?raw";

/**
 * Applique le schéma initial. Phase 0 : une seule migration "de base",
 * idempotente (CREATE TABLE IF NOT EXISTS). Un vrai système de migrations
 * versionnées sera introduit en Phase 1 si des évolutions de schéma sont
 * nécessaires après la mise en service.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(schemaSql);
}
