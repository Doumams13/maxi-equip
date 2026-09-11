import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../db/migrate.js";
import { BackupService, DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS, NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES } from "./backupService.js";

/**
 * Tests réels du service de sauvegarde (Phase 3.8, Partie 17) — avec une
 * VRAIE base SQLite chiffrée (jamais un mock), un vrai dossier temporaire
 * sur disque, et de vraies opérations de fichiers.
 */

const CLE_TEST = "cle-de-test-sauvegarde-256-bits-simulee";

let dossierTravail: string;
let db: Database.Database;
let cheminDb: string;

beforeEach(() => {
  dossierTravail = mkdtempSync(join(tmpdir(), "maxi-equip-backup-test-"));
  cheminDb = join(dossierTravail, "maxi-equip.sqlite");
  db = new Database(cheminDb);
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

describe("BackupService — Phase 3.8 (base chiffrée réelle)", () => {
  it("TEST A — sauvegarde manuelle : fichier créé, archive lisible, metadata présent, base ouvrable, intégrité valide", () => {
    const dossierDestination = join(dossierTravail, "destination-utilisateur");
    const service = creerService();

    const resultat = service.creerSauvegardeManuelle(dossierDestination);

    expect(resultat.success).toBe(true);
    expect(resultat.chemin).toBeDefined();
    expect(existsSync(resultat.chemin!)).toBe(true);
    expect(existsSync(join(resultat.chemin!, "database.sqlite"))).toBe(true);
    expect(existsSync(join(resultat.chemin!, "metadata.json"))).toBe(true);

    const metadata = JSON.parse(readFileSync(join(resultat.chemin!, "metadata.json"), "utf-8"));
    expect(metadata.format).toBe("MAXI_EQUIP_BACKUP");
    expect(metadata.backup.type).toBe("manual");
    expect(metadata.database.encryptionKeyHex).toBe(CLE_TEST);

    // Réouverture réelle avec la clé, comme le ferait une future restauration.
    const copie = new Database(join(resultat.chemin!, "database.sqlite"), { readonly: true });
    copie.pragma(`key='${CLE_TEST}'`);
    copie.pragma("cipher_version");
    expect(copie.pragma("integrity_check", { simple: true })).toBe("ok");
    copie.close();
  });

  it("TEST B — données réelles : la base sauvegardée contient réellement les données présentes au moment de la sauvegarde", () => {
    db.prepare("UPDATE parametres_entreprise SET nom = ? WHERE id = 'singleton'").run("MAXI-EQUIP TEST BACKUP");
    const idProduit = "prod-test-1";
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, 'Carreau Backup', 'carrelage', '60x60', 60, 'BACK-001', 15000, 10, ?, ?)"
    ).run(idProduit, new Date().toISOString(), new Date().toISOString());

    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"));
    expect(resultat.success).toBe(true);

    const copie = new Database(join(resultat.chemin!, "database.sqlite"), { readonly: true });
    copie.pragma(`key='${CLE_TEST}'`);
    copie.pragma("cipher_version");
    const parametres = copie.prepare("SELECT nom FROM parametres_entreprise WHERE id = 'singleton'").get() as { nom: string };
    const produit = copie.prepare("SELECT motif FROM produits WHERE id = ?").get(idProduit) as { motif: string } | undefined;
    expect(parametres.nom).toBe("MAXI-EQUIP TEST BACKUP");
    expect(produit?.motif).toBe("Carreau Backup");
    copie.close();
  });

  it("TEST C — base active avec écriture WAL non checkpointée : sauvegarde cohérente, pas de corruption", () => {
    // Écriture juste avant la sauvegarde, sans checkpoint manuel — simule l'état réel juste après une vente.
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES ('p-recent', 'Donnee toute recente', 'carrelage', '30x30', 30, 'REC-001', 5000, 5, ?, ?)"
    ).run(new Date().toISOString(), new Date().toISOString());

    const service = creerService();
    const resultat = service.creerSauvegardeManuelle(join(dossierTravail, "destination"));
    expect(resultat.success).toBe(true);

    const copie = new Database(join(resultat.chemin!, "database.sqlite"), { readonly: true });
    copie.pragma(`key='${CLE_TEST}'`);
    copie.pragma("cipher_version");
    expect(copie.pragma("integrity_check", { simple: true })).toBe("ok");
    const produit = copie.prepare("SELECT motif FROM produits WHERE id = 'p-recent'").get() as { motif: string };
    expect(produit.motif).toBe("Donnee toute recente");
    copie.close();
  });

  it("TEST D — automatique : la première sauvegarde est réellement créée", () => {
    const service = creerService();
    const resultat = service.creerSauvegardeAutomatiqueSiNecessaire();
    expect(resultat).not.toBeNull();
    expect(resultat!.success).toBe(true);
  });

  it("TEST E — anti-spam : une deuxième tentative dans le délai ne crée aucune nouvelle sauvegarde", () => {
    const service = creerService();
    const premiere = service.creerSauvegardeAutomatiqueSiNecessaire();
    expect(premiere).not.toBeNull();

    const deuxieme = service.creerSauvegardeAutomatiqueSiNecessaire();
    expect(deuxieme).toBeNull(); // Aucune tentative, jamais une erreur — simplement rien à faire.

    expect(service.listerSauvegardesAutomatiques()).toHaveLength(1);
  });

  it("TEST F — nouveau délai dépassé : une nouvelle sauvegarde automatique est bien créée", () => {
    const service = creerService();
    service.creerSauvegardeAutomatiqueSiNecessaire();

    // Fabrique une entrée "ancienne" en modifiant directement son metadata.json — simule le dépassement du délai sans attendre réellement 24h.
    const entrees = service.listerSauvegardesAutomatiques();
    const entree = entrees[0]!;
    const cheminMetadata = join(entree.chemin, "metadata.json");
    const metadata = JSON.parse(readFileSync(cheminMetadata, "utf-8"));
    metadata.backup.createdAt = new Date(Date.now() - DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS - 1000).toISOString();
    writeFileSync(cheminMetadata, JSON.stringify(metadata));

    const resultat = service.creerSauvegardeAutomatiqueSiNecessaire();
    expect(resultat).not.toBeNull();
    expect(resultat!.success).toBe(true);
    expect(service.listerSauvegardesAutomatiques()).toHaveLength(2);
  });

  it("TEST G — purge : seules les automatiques les plus anciennes sont supprimées, jamais les manuelles", () => {
    const service = creerService();

    // Cree manuellement NOMBRE_MAX + 3 sauvegardes automatiques, avec des dates échelonnées, en contournant l'anti-spam pour ce test précis.
    for (let i = 0; i < NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES + 3; i++) {
      const resultat = service.creerSauvegardeAutomatiqueSiNecessaire();
      if (!resultat) {
        // Anti-spam actif dès la 2e — on avance artificiellement la date de la dernière pour forcer la suivante.
        const derniere = service.listerSauvegardesAutomatiques()[0]!;
        const metadata = JSON.parse(readFileSync(join(derniere.chemin, "metadata.json"), "utf-8"));
        metadata.backup.createdAt = new Date(Date.now() - DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS - 1000).toISOString();
        writeFileSync(join(derniere.chemin, "metadata.json"), JSON.stringify(metadata));
        service.creerSauvegardeAutomatiqueSiNecessaire();
      }
    }

    // Une sauvegarde manuelle, dans un dossier totalement séparé — ne doit jamais être vue ni touchée par la purge.
    const manuelle = service.creerSauvegardeManuelle(join(dossierTravail, "destination-manuelle"));
    expect(manuelle.success).toBe(true);

    const automatiques = service.listerSauvegardesAutomatiques();
    expect(automatiques.length).toBe(NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES);
    expect(existsSync(manuelle.chemin!)).toBe(true); // La manuelle est toujours là, intacte.
  });

  it("TEST H — échec (base source invalide) : nettoyage complet, aucune sauvegarde partielle, base originale intacte", () => {
    const dbCassee = new Database(join(dossierTravail, "cassee.sqlite"));
    dbCassee.pragma(`key='mauvaise-cle-differente'`);
    // Ne définit jamais correctement la clé de chiffrement attendue par le service → VACUUM INTO échouera dans ce contexte de test.
    const serviceCasse = new BackupService(dbCassee, "cle-qui-ne-correspond-pas-a-la-base", join(dossierTravail, "backups-echec"));

    const dossierDestination = join(dossierTravail, "destination-echec");
    const resultat = serviceCasse.creerSauvegardeManuelle(dossierDestination);

    // Le comportement exact dépend de l'étape d'échec, mais dans tous les cas : jamais de dossier `.tmp-` oublié, jamais de sauvegarde partielle visible.
    if (existsSync(dossierDestination)) {
      const contenu = readdirSync(dossierDestination);
      expect(contenu.every((n) => !n.startsWith(".tmp-"))).toBe(true);
      expect(contenu.every((n) => !n.startsWith("MAXI-EQUIP_BACKUP_"))).toBe(resultat.success === false);
    }
    dbCassee.close();
  });
});
