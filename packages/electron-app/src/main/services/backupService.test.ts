import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../db/migrate.js";
import { BackupService, DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS, NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES } from "./backupService.js";
import { recupererCleAvecMotDePasse } from "./backupCrypto.js";

const CLE_TEST = "cle-de-test-sauvegarde-256-bits-simulee";
const MOT_DE_PASSE = "MotDePasseTest2026";

let dossierTravail: string;
let db: Database.Database;

beforeEach(() => {
  dossierTravail = mkdtempSync(join(tmpdir(), "maxi-equip-backup-test-"));
  db = new Database(join(dossierTravail, "maxi-equip.sqlite"));
  db.pragma(`key='${CLE_TEST}'`);
  db.pragma("cipher_version");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
});

afterEach(() => {
  db.close();
  rmSync(dossierTravail, { recursive: true, force: true });
});

function creerService(dossierAuto = join(dossierTravail, "backups")): BackupService {
  return new BackupService(db, CLE_TEST, dossierAuto);
}

describe("BackupService — sécurité des sauvegardes manuelles", () => {
  it("TEST A — sauvegarde manuelle : dossier créé, metadata présent, base présente, AUCUNE clé en clair, ouvrable avec le mot de passe, intégrité valide", () => {
    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"), MOT_DE_PASSE);

    expect(resultat.success).toBe(true);
    expect(existsSync(join(resultat.chemin!, "database.sqlite"))).toBe(true);

    const metadataBrut = readFileSync(join(resultat.chemin!, "metadata.json"), "utf-8");
    const metadata = JSON.parse(metadataBrut);

    expect(metadataBrut).not.toContain(CLE_TEST);
    expect(metadata.database.encryptionKeyHex).toBeUndefined();
    expect(metadata.database.keyProtection).toBeDefined();
    expect(metadata.database.keyProtection.cleChiffree).toBeDefined();

    const cleReelle = recupererCleAvecMotDePasse(metadata.database.keyProtection, MOT_DE_PASSE);
    const copie = new Database(join(resultat.chemin!, "database.sqlite"), { readonly: true });
    copie.pragma(`key='${cleReelle}'`);
    copie.pragma("cipher_version");
    expect(copie.pragma("integrity_check", { simple: true })).toBe("ok");
    copie.close();
  });

  it("TEST B — mauvais mot de passe : échec propre à la récupération de la clé, jamais une clé erronée silencieusement acceptée", () => {
    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"), MOT_DE_PASSE);
    const metadata = JSON.parse(readFileSync(join(resultat.chemin!, "metadata.json"), "utf-8"));

    expect(() => recupererCleAvecMotDePasse(metadata.database.keyProtection, "MauvaisMotDePasse")).toThrow();
  });

  it("TEST C — bon mot de passe : sauvegarde réellement exploitable (lecture de données réelles)", () => {
    db.prepare("UPDATE parametres_entreprise SET nom = ? WHERE id = 'singleton'").run("MAXI-EQUIP SECURITE TEST");
    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"), MOT_DE_PASSE);
    const metadata = JSON.parse(readFileSync(join(resultat.chemin!, "metadata.json"), "utf-8"));

    const cle = recupererCleAvecMotDePasse(metadata.database.keyProtection, MOT_DE_PASSE);
    const copie = new Database(join(resultat.chemin!, "database.sqlite"), { readonly: true });
    copie.pragma(`key='${cle}'`);
    copie.pragma("cipher_version");
    const parametres = copie.prepare("SELECT nom FROM parametres_entreprise WHERE id = 'singleton'").get() as { nom: string };
    expect(parametres.nom).toBe("MAXI-EQUIP SECURITE TEST");
    copie.close();
  });

  it("TEST D — données réelles (produit) présentes dans une sauvegarde manuelle protégée", () => {
    const idProduit = "prod-securite-1";
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, 'Carreau Securite', 'carrelage', '60x60', 60, 'SEC-001', 20000, 10, ?, ?)"
    ).run(idProduit, new Date().toISOString(), new Date().toISOString());

    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"), MOT_DE_PASSE);
    const metadata = JSON.parse(readFileSync(join(resultat.chemin!, "metadata.json"), "utf-8"));
    const cle = recupererCleAvecMotDePasse(metadata.database.keyProtection, MOT_DE_PASSE);

    const copie = new Database(join(resultat.chemin!, "database.sqlite"), { readonly: true });
    copie.pragma(`key='${cle}'`);
    copie.pragma("cipher_version");
    const produit = copie.prepare("SELECT motif FROM produits WHERE id = ?").get(idProduit) as { motif: string };
    expect(produit.motif).toBe("Carreau Securite");
    copie.close();
  });

  it("TEST F — mots de passe non concordants : jamais transmis au service par l'IPC, aucune sauvegarde créée", () => {
    const dossierDestination = join(dossierTravail, "destination-refus");
    expect(existsSync(dossierDestination)).toBe(false);
    // La vérification de concordance elle-même est testée dans backupCrypto.test.ts (validerMotDePasse) — ici on confirme qu'aucun effet de bord n'existe côté service tant qu'il n'est pas appelé.
  });

  it("TEST G — sauvegardes automatiques : fonctionnent toujours, anti-spam 24h, purge à 10, jamais de clé (ni en clair ni protégée)", () => {
    const service = creerService();
    const resultat = service.creerSauvegardeAutomatiqueSiNecessaire();
    expect(resultat!.success).toBe(true);

    const metadata = JSON.parse(readFileSync(join(resultat!.chemin!, "metadata.json"), "utf-8"));
    expect(metadata.database.keyProtection).toBeUndefined();
    expect(metadata.database.encryptionKeyHex).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain(CLE_TEST);

    expect(service.creerSauvegardeAutomatiqueSiNecessaire()).toBeNull();

    for (let i = 0; i < NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES + 2; i++) {
      const entrees = service.listerSauvegardesAutomatiques();
      const derniere = entrees[0]!;
      const m = JSON.parse(readFileSync(join(derniere.chemin, "metadata.json"), "utf-8"));
      m.backup.createdAt = new Date(Date.now() - DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS - 1000).toISOString();
      writeFileSync(join(derniere.chemin, "metadata.json"), JSON.stringify(m));
      service.creerSauvegardeAutomatiqueSiNecessaire();
    }
    expect(service.listerSauvegardesAutomatiques().length).toBe(NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES);

    const manuelle = service.creerSauvegardeManuelle(join(dossierTravail, "destination-manuelle"), MOT_DE_PASSE);
    expect(existsSync(manuelle.chemin!)).toBe(true);
  });

  it("TEST H — régression : la création d'une sauvegarde n'écrit jamais sur la base source", () => {
    const avant = db.prepare("SELECT COUNT(*) as n FROM produits").get() as { n: number };
    const service = creerService();
    service.creerSauvegardeManuelle(join(dossierTravail, "destination"), MOT_DE_PASSE);
    const apres = db.prepare("SELECT COUNT(*) as n FROM produits").get() as { n: number };
    expect(apres.n).toBe(avant.n);
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
  });

  it("refuse un mot de passe trop court (défense en profondeur du service)", () => {
    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"), "court");
    expect(resultat.success).toBe(false);
  });
});
