import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { runMigrations } from "../db/migrate.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { BackupService } from "./backupService.js";
import { BackupRestoreService } from "./backupRestoreService.js";

/**
 * Allègement de la base (2026-11-24) — PREUVE DE BOUT EN BOUT que
 * l'allègement n'affecte pas les restaurations, sur une vraie base
 * SQLCipher (même moteur, même clé, même WAL que l'application) :
 *   1. base "gonflée" (copies d'images confirmées) + vraies données ;
 *   2. allègement + VACUUM exactement comme au démarrage (main/index.ts) ;
 *   3. la base se rouvre avec sa clé, intègre, données intactes ;
 *   4. sauvegarde réelle (BackupService) puis restauration réelle
 *      (BackupRestoreService) : données restaurées identiques ;
 *   5. une ANCIENNE sauvegarde (prise avant l'allègement, donc gonflée)
 *      se restaure aussi, puis s'allège au démarrage suivant.
 */
const CLE = "cle-installation-test-256-bits";
const MOT_DE_PASSE = "MotDePasseRestaure2026";
let dossier: string;

afterEach(() => rmSync(dossier, { recursive: true, force: true }));

function ouvrir(chemin: string): Database.Database {
  const db = new Database(chemin);
  db.pragma(`key='${CLE}'`);
  db.pragma("cipher_version");
  db.pragma("journal_mode = WAL");
  return db;
}

function alleger(db: Database.Database): number {
  const n = new BoiteEnvoiRepository(db).retirerContenuImagesConfirmees();
  if (n > 0) db.exec("VACUUM");
  return n;
}

function donnees(db: Database.Database) {
  return {
    emplacements: db.prepare("SELECT id, nom FROM emplacements ORDER BY id").all(),
    boite: db.prepare("SELECT id, entity_type, status FROM boite_envoi ORDER BY id").all(),
    integrite: (db.pragma("integrity_check") as { integrity_check: string }[])[0]!.integrity_check,
  };
}

describe("allègement de la base — aucune incidence sur les restaurations", () => {
  it("base allégée : rouverte intègre, sauvegardée puis restaurée à l'identique ; une ancienne sauvegarde gonflée se restaure aussi", async () => {
    dossier = mkdtempSync(join(tmpdir(), "allegement-restauration-"));
    const cheminBase = join(dossier, "maxi-equip.sqlite");
    let db = ouvrir(cheminBase);
    runMigrations(db);
    const maintenant = new Date().toISOString();
    db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('d1', 'Akanda', 'depot', 'Libreville', 0, ?, ?)").run(maintenant, maintenant);
    const boite = new BoiteEnvoiRepository(db);
    for (let i = 0; i < 6; i++) {
      const id = boite.creer("image_produit", `img${i}`, { operation: "create", imageId: `img${i}`, contentBase64: randomBytes(400_000).toString("base64"), contentType: "image/jpeg" });
      boite.mettreAJourStatut(id, "confirmed");
    }
    const enAttente = boite.creer("image_produit", "img-attente", { operation: "create", contentBase64: randomBytes(1000).toString("base64") });

    // Sauvegarde AVANT allègement (cas réel : une sauvegarde d'octobre, gonflée).
    let services = new BackupService(db, CLE, join(dossier, "backups"));
    const ancienne = services.creerSauvegardeManuelle(join(dossier, "ancienne"), MOT_DE_PASSE);
    expect(ancienne.success).toBe(true);

    db.pragma("wal_checkpoint(TRUNCATE)");
    const tailleAvant = statSync(cheminBase).size;
    const reference = donnees(db);

    // 2. Allègement comme au démarrage.
    expect(alleger(db)).toBe(6);
    db.close();

    // 3. Réouverture avec la clé : intègre, données intactes, plus petite.
    db = ouvrir(cheminBase);
    expect(statSync(cheminBase).size).toBeLessThan(tailleAvant * 0.3);
    expect(donnees(db)).toEqual(reference);
    expect(JSON.parse(new BoiteEnvoiRepository(db).findById(enAttente)!.payloadJson).contentBase64).toBeTypeOf("string");

    // 4. Sauvegarde réelle de la base allégée puis restauration réelle.
    services = new BackupService(db, CLE, join(dossier, "backups"));
    const nouvelle = services.creerSauvegardeManuelle(join(dossier, "nouvelle"), MOT_DE_PASSE);
    expect(nouvelle.success).toBe(true);
    let restore = new BackupRestoreService(services, CLE, cheminBase, () => db.close());
    const r1 = await restore.executerRestauration(nouvelle.chemin!, MOT_DE_PASSE);
    expect(r1.success).toBe(true);
    db = ouvrir(cheminBase);
    expect(donnees(db)).toEqual(reference);

    // 5. Restauration de l'ANCIENNE sauvegarde gonflée, puis allègement au démarrage suivant.
    services = new BackupService(db, CLE, join(dossier, "backups"));
    restore = new BackupRestoreService(services, CLE, cheminBase, () => db.close());
    const r2 = await restore.executerRestauration(ancienne.chemin!, MOT_DE_PASSE);
    expect(r2.success).toBe(true);
    db = ouvrir(cheminBase);
    expect(donnees(db)).toEqual(reference);
    expect(alleger(db)).toBe(6);
    expect(donnees(db)).toEqual(reference);
    db.close();
  });
});
