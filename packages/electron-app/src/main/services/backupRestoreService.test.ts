import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../db/migrate.js";
import { BackupService } from "./backupService.js";
import { BackupRestoreService } from "./backupRestoreService.js";

const CLE_INSTALLATION = "cle-installation-test-256-bits";
const MOT_DE_PASSE = "MotDePasseRestaure2026";

let dossierTravail: string;
let cheminBaseLive: string;
let db: Database.Database;

function ouvrirBaseLive(): Database.Database {
  const instance = new Database(cheminBaseLive);
  instance.pragma(`key='${CLE_INSTALLATION}'`);
  instance.pragma("cipher_version");
  instance.pragma("journal_mode = WAL");
  return instance;
}

beforeEach(() => {
  dossierTravail = mkdtempSync(join(tmpdir(), "maxi-equip-restore-test-"));
  cheminBaseLive = join(dossierTravail, "maxi-equip.sqlite");
  db = ouvrirBaseLive();
  runMigrations(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // Déjà fermée par un test.
  }
  rmSync(dossierTravail, { recursive: true, force: true });
});

function creerServices(): { backupService: BackupService; restoreService: BackupRestoreService; fermerAppele: () => boolean } {
  const backupService = new BackupService(db, CLE_INSTALLATION, join(dossierTravail, "backups"));
  let ferme = false;
  const fermerBase = () => {
    ferme = true;
    db.close();
  };
  const restoreService = new BackupRestoreService(backupService, CLE_INSTALLATION, cheminBaseLive, fermerBase);
  return { backupService, restoreService, fermerAppele: () => ferme };
}

describe("BackupRestoreService — Phase 3.9", () => {
  it("CAS 1 — dossier inexistant : incompatible, aucune modification", () => {
    const { restoreService } = creerServices();
    const analyse = restoreService.analyserSauvegarde(join(dossierTravail, "n-existe-pas"));
    expect(analyse.compatible).toBe("incompatible");
  });

  it("CAS 2 — metadata.json absent : incompatible", () => {
    const { restoreService } = creerServices();
    const dossierVide = join(dossierTravail, "vide");
    mkdirSync(dossierVide);
    writeFileSync(join(dossierVide, "database.sqlite"), "x");
    expect(restoreService.analyserSauvegarde(dossierVide).compatible).toBe("incompatible");
  });

  it("CAS 3 — database.sqlite absent : incompatible", () => {
    const { restoreService } = creerServices();
    const dossierVide = join(dossierTravail, "sans-db");
    mkdirSync(dossierVide);
    writeFileSync(join(dossierVide, "metadata.json"), "{}");
    expect(restoreService.analyserSauvegarde(dossierVide).compatible).toBe("incompatible");
  });

  it("CAS 4 — JSON invalide : incompatible", () => {
    const { restoreService } = creerServices();
    const dossier = join(dossierTravail, "json-invalide");
    mkdirSync(dossier);
    writeFileSync(join(dossier, "metadata.json"), "{ceci n'est pas du json");
    writeFileSync(join(dossier, "database.sqlite"), "x");
    expect(restoreService.analyserSauvegarde(dossier).compatible).toBe("incompatible");
  });

  it("CAS 5 — mauvais format : incompatible", () => {
    const { restoreService } = creerServices();
    const dossier = join(dossierTravail, "mauvais-format");
    mkdirSync(dossier);
    writeFileSync(join(dossier, "metadata.json"), JSON.stringify({ format: "AUTRE_CHOSE" }));
    writeFileSync(join(dossier, "database.sqlite"), "x");
    expect(restoreService.analyserSauvegarde(dossier).compatible).toBe("incompatible");
  });

  it("CAS 7 — schemaVersion incompatible (supérieure à celle de l'installation) : incompatible", () => {
    const { restoreService } = creerServices();
    const dossier = join(dossierTravail, "schema-futur");
    mkdirSync(dossier);
    writeFileSync(
      join(dossier, "metadata.json"),
      JSON.stringify({
        format: "MAXI_EQUIP_BACKUP",
        formatVersion: 2,
        backup: { createdAt: "2026-01-01", type: "automatic" },
        database: { filename: "database.sqlite", schemaVersion: 9999 },
      })
    );
    writeFileSync(join(dossier, "database.sqlite"), "x");
    expect(restoreService.analyserSauvegarde(dossier).compatible).toBe("incompatible");
  });

  it("CAS 8 — base corrompue : la restauration échoue à la vérification, aucune modification de la base live", async () => {
    const { backupService, restoreService } = creerServices();
    const resultat = backupService.creerSauvegardeManuelle(join(dossierTravail, "backup-corrompue"), MOT_DE_PASSE);
    writeFileSync(join(resultat.chemin!, "database.sqlite"), "donnees completement corrompues, jamais une vraie base sqlite");

    const avant = readFileSync(cheminBaseLive);
    const restauration = await restoreService.executerRestauration(resultat.chemin!, MOT_DE_PASSE);
    expect(restauration.success).toBe(false);
    expect(readFileSync(cheminBaseLive).equals(avant)).toBe(true);
  });

  it("CAS 9 — mot de passe incorrect : échec propre, aucune modification", async () => {
    const { backupService, restoreService } = creerServices();
    const resultat = backupService.creerSauvegardeManuelle(join(dossierTravail, "backup-mdp"), MOT_DE_PASSE);

    const avant = readFileSync(cheminBaseLive);
    const restauration = await restoreService.executerRestauration(resultat.chemin!, "MauvaisMotDePasse");
    expect(restauration.success).toBe(false);
    expect(restauration.message).toContain("incorrect");
    expect(readFileSync(cheminBaseLive).equals(avant)).toBe(true);
  });

  it("CAS 6 — formatVersion futur non supporté structurellement : incompatible", () => {
    const { restoreService } = creerServices();
    const dossier = join(dossierTravail, "format-futur");
    mkdirSync(dossier);
    // formatVersion 3 n'existe pas encore dans cette version de l'application — traité comme une version de schéma trop récente si elle dépasse ce que l'installation comprend.
    writeFileSync(
      join(dossier, "metadata.json"),
      JSON.stringify({
        format: "MAXI_EQUIP_BACKUP",
        formatVersion: 3,
        backup: { createdAt: "2026-01-01", type: "manual" },
        database: { filename: "database.sqlite", schemaVersion: 9999 },
      })
    );
    writeFileSync(join(dossier, "database.sqlite"), "x");
    expect(restoreService.analyserSauvegarde(dossier).compatible).toBe("incompatible");
  });

  it("CAS 10 — échec de la safety backup : restauration entièrement annulée, base live jamais touchée", async () => {
    const { backupService, restoreService } = creerServices();
    const resultat = backupService.creerSauvegardeManuelle(join(dossierTravail, "backup-safety-echec"), MOT_DE_PASSE);

    // Rend le dossier interne des sauvegardes (utilisé par creerSauvegardeSecurite) inutilisable, pour provoquer un vrai échec de la safety backup.
    const dossierBackupsInterne = join(dossierTravail, "backups");
    rmSync(dossierBackupsInterne, { recursive: true, force: true });
    writeFileSync(dossierBackupsInterne, "ceci est un fichier, pas un dossier — empeche la creation du sous-dossier safety");

    const avant = readFileSync(cheminBaseLive);
    const restauration = await restoreService.executerRestauration(resultat.chemin!, MOT_DE_PASSE);
    expect(restauration.success).toBe(false);
    expect(restauration.etape).toBe("safety");
    expect(readFileSync(cheminBaseLive).equals(avant)).toBe(true); // Aucune modification, malgré une sauvegarde source pourtant valide.
  });

  it("CAS 12 + Partie 10/15 — RESTAURATION COMPLÈTE RÉUSSIE, scénario bout-en-bout réel avec vraies données", async () => {
    db.prepare("UPDATE parametres_entreprise SET nom = ? WHERE id = 'singleton'").run("ETAT A - AVANT SAUVEGARDE");
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES ('p-etat-a', 'Produit Etat A', 'carrelage', '60x60', 60, 'A-001', 10000, 5, ?, ?)"
    ).run(new Date().toISOString(), new Date().toISOString());

    const { backupService, restoreService, fermerAppele } = creerServices();
    const sauvegarde = backupService.creerSauvegardeManuelle(join(dossierTravail, "backup-etat-a"), MOT_DE_PASSE);
    expect(sauvegarde.success).toBe(true);

    db.prepare("UPDATE parametres_entreprise SET nom = ? WHERE id = 'singleton'").run("ETAT B - APRES MODIFICATIONS");
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES ('p-etat-b', 'Produit Etat B (ne doit pas survivre)', 'carrelage', '30x30', 30, 'B-001', 3000, 2, ?, ?)"
    ).run(new Date().toISOString(), new Date().toISOString());

    const restauration = await restoreService.executerRestauration(sauvegarde.chemin!, MOT_DE_PASSE);
    expect(restauration.success).toBe(true);
    expect(fermerAppele()).toBe(true);

    const baseRestauree = ouvrirBaseLive();
    const parametres = baseRestauree.prepare("SELECT nom FROM parametres_entreprise WHERE id = 'singleton'").get() as { nom: string };
    expect(parametres.nom).toBe("ETAT A - AVANT SAUVEGARDE");

    const produitA = baseRestauree.prepare("SELECT motif FROM produits WHERE id = 'p-etat-a'").get() as { motif: string } | undefined;
    expect(produitA?.motif).toBe("Produit Etat A");

    const produitB = baseRestauree.prepare("SELECT motif FROM produits WHERE id = 'p-etat-b'").get();
    expect(produitB).toBeUndefined();

    expect(baseRestauree.pragma("integrity_check", { simple: true })).toBe("ok");
    baseRestauree.close();

    const dossierSafety = join(dossierTravail, "backups", "safety");
    expect(existsSync(dossierSafety)).toBe(true);
    const [nomSafety] = readdirSync(dossierSafety);
    const contenuSafety = readFileSync(join(dossierSafety, nomSafety!, "metadata.json"), "utf-8");
    expect(JSON.parse(contenuSafety).backup.type).toBe("safety");
  });

  it("restauration d'une sauvegarde automatique (clé d'installation directement, sans mot de passe)", async () => {
    db.prepare("UPDATE parametres_entreprise SET nom = ? WHERE id = 'singleton'").run("ETAT AUTOMATIQUE");
    const { backupService, restoreService } = creerServices();
    const sauvegarde = backupService.creerSauvegardeAutomatiqueSiNecessaire();
    expect(sauvegarde!.success).toBe(true);

    db.prepare("UPDATE parametres_entreprise SET nom = ? WHERE id = 'singleton'").run("MODIFIE APRES");

    const restauration = await restoreService.executerRestauration(sauvegarde!.chemin!);
    expect(restauration.success).toBe(true);

    const baseRestauree = ouvrirBaseLive();
    const p = baseRestauree.prepare("SELECT nom FROM parametres_entreprise WHERE id = 'singleton'").get() as { nom: string };
    expect(p.nom).toBe("ETAT AUTOMATIQUE");
    baseRestauree.close();
  });

  it("Partie 11 — une ancienne sauvegarde vulnérable (v1, clé en clair) est restaurable avec avertissement, jamais prétendue sécurisée", async () => {
    const dossier = join(dossierTravail, "ancienne-vulnerable");
    mkdirSync(dossier);
    db.exec(`VACUUM INTO '${join(dossier, "database.sqlite").replace(/'/g, "''")}'`);
    writeFileSync(
      join(dossier, "metadata.json"),
      JSON.stringify({
        format: "MAXI_EQUIP_BACKUP",
        formatVersion: 1,
        backup: { createdAt: "2026-01-01T00:00:00.000Z", type: "automatic" },
        database: { filename: "database.sqlite", schemaVersion: 1, encryptionKeyHex: CLE_INSTALLATION },
      })
    );

    const { restoreService } = creerServices();
    const analyse = restoreService.analyserSauvegarde(dossier);
    expect(analyse.compatible).toBe("avertissement");
    expect(analyse.vulnerable).toBe(true);
    expect(analyse.message).not.toContain("sécurisée.");

    const restauration = await restoreService.executerRestauration(dossier);
    expect(restauration.success).toBe(true);
  });

  it("RÉGRESSION réelle (2026-10-24, production) — une sauvegarde 'automatic' porteuse d'un keyProtection (récupération après vol/panne, voir installationRecuperationService.ts) se restaure avec le bon mot de passe, jamais 'file is not a database'", async () => {
    const { backupService, restoreService } = creerServices();
    // Même mécanique EXACTE que installationRecuperationService.ts : une
    // sauvegarde cloud "automatic" dont le metadata.json reçoit un
    // `keyProtection` injecté après coup (chiffré avec le mot de passe
    // Administrateur) — AVANT la correction, `backup.type !== "manual"`
    // faisait ignorer ce `keyProtection` et retomber sur la clé LOCALE de
    // ce poste (jamais celle de la sauvegarde), d'où l'échec "file is not
    // a database" reproduit en production.
    const resultat = backupService.creerSauvegardeManuelle(join(dossierTravail, "backup-recuperation"), MOT_DE_PASSE);
    const cheminMetadata = join(resultat.chemin!, "metadata.json");
    const metadata = JSON.parse(readFileSync(cheminMetadata, "utf-8")) as { backup: { type: string } };
    expect(metadata.backup.type).toBe("manual"); // hypothèse de départ du test, avant modification
    metadata.backup.type = "automatic";
    writeFileSync(cheminMetadata, JSON.stringify(metadata));

    const restauration = await restoreService.executerRestauration(resultat.chemin!, MOT_DE_PASSE);
    expect(restauration.success).toBe(true);
  });

  it("RÉGRESSION — même scénario 'automatic' + keyProtection, mais avec un mauvais mot de passe : échec propre (message 'incorrect'), jamais le message technique SQLCipher brut", async () => {
    const { backupService, restoreService } = creerServices();
    const resultat = backupService.creerSauvegardeManuelle(join(dossierTravail, "backup-recuperation-mauvais-mdp"), MOT_DE_PASSE);
    const cheminMetadata = join(resultat.chemin!, "metadata.json");
    const metadata = JSON.parse(readFileSync(cheminMetadata, "utf-8")) as { backup: { type: string } };
    metadata.backup.type = "automatic";
    writeFileSync(cheminMetadata, JSON.stringify(metadata));

    const avant = readFileSync(cheminBaseLive);
    const restauration = await restoreService.executerRestauration(resultat.chemin!, "MauvaisMotDePasse");
    expect(restauration.success).toBe(false);
    expect(restauration.message).toContain("incorrect");
    expect(readFileSync(cheminBaseLive).equals(avant)).toBe(true);
  });
});
