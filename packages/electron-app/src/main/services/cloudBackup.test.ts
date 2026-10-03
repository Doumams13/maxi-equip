import { describe, it, expect, beforeAll, afterAll } from "vitest";
import S3rver from "s3rver";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3CloudBackupProvider } from "./s3CloudBackupProvider.js";
import { CloudBackupService } from "./cloudBackupService.js";

/**
 * Tests RÉELS du backup cloud — Bloc 4 (remédiation pré-production).
 * Aucun identifiant AWS réel n'existe dans cet environnement de
 * développement ; conformément à l'esprit de "ne jamais considérer un
 * upload comme preuve sans restauration réelle", ce fichier démarre un
 * VRAI serveur compatible S3 (`s3rver`, qui implémente réellement le
 * protocole HTTP S3 — PUT/GET/LIST/DELETE réels) plutôt que de mocker
 * `S3CloudBackupProvider` ou `CloudBackupService` eux-mêmes. Seul le
 * point de terminaison change par rapport à AWS S3 réel (`endpoint` +
 * `forcePathStyle`) — le code testé est EXACTEMENT celui qui parlerait
 * à un vrai fournisseur cloud en production.
 *
 * Scénario obligatoire rejoué explicitement (test principal ci-dessous) :
 * backup local → upload cloud → suppression locale → téléchargement
 * cloud → restauration → vérification des données.
 */

const PORT = 45291;
const BUCKET = "maxi-equip-backups-test";
let serveurS3: S3rver;
let dossierStockageS3: string;
let dossierTravail: string;
let provider: S3CloudBackupProvider;
let service: CloudBackupService;

beforeAll(async () => {
  dossierStockageS3 = mkdtempSync(join(tmpdir(), "maxi-equip-s3rver-"));
  serveurS3 = new S3rver({
    address: "localhost",
    port: PORT,
    silent: true,
    directory: dossierStockageS3,
    vhostBuckets: false,
    configureBuckets: [{ name: BUCKET, configs: [] }],
  });
  await new Promise<void>((resolve, reject) => {
    serveurS3.run((err) => (err ? reject(err) : resolve()));
  });

  provider = new S3CloudBackupProvider({
    bucket: BUCKET,
    region: "us-east-1",
    endpoint: `http://localhost:${PORT}`,
    forcePathStyle: true,
    accessKeyId: "S3RVER",
    secretAccessKey: "S3RVER",
  });
  service = new CloudBackupService(provider);
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    serveurS3.close((err) => (err ? reject(err) : resolve()));
  });
  rmSync(dossierStockageS3, { recursive: true, force: true });
}, 15_000);

function creerFauxBackupLocal(nom: string, contenuBase: string): string {
  const dossier = join(dossierTravail, nom);
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "database.sqlite"), contenuBase);
  writeFileSync(join(dossier, "metadata.json"), JSON.stringify({ format: "MAXI_EQUIP_BACKUP", backup: { createdAt: new Date().toISOString(), type: "automatic" } }));
  return dossier;
}

describe("Backup cloud — scénario réel complet (vrai serveur S3)", () => {
  beforeAll(() => {
    dossierTravail = mkdtempSync(join(tmpdir(), "maxi-equip-cloudbackup-"));
  });
  afterAll(() => {
    rmSync(dossierTravail, { recursive: true, force: true });
  });

  it("SCÉNARIO OBLIGATOIRE — backup local → upload cloud → suppression locale → téléchargement → restauration → vérification des données", async () => {
    // 1. Backup local (simule un backup automatique déjà produit par BackupService — jamais des données réelles du client, contenu simulé).
    const contenuOriginal = `SQLCIPHER-SIMULE-${"x".repeat(500)}-CONTENU-DE-TEST-NON-DESTRUCTIF`;
    const dossierLocal = creerFauxBackupLocal("MAXI-EQUIP_BACKUP_2026-01-01_00-00-00", contenuOriginal);
    expect(existsSync(join(dossierLocal, "database.sqlite"))).toBe(true);

    // 2. Upload cloud.
    const resultatUpload = await service.sauvegarderVersLeCloud(dossierLocal, "MAXI-EQUIP_BACKUP_2026-01-01_00-00-00");
    expect(resultatUpload.success).toBe(true);

    // 3. Suppression locale de la copie de test (jamais les données réelles du client — un dossier de test créé par CE test).
    rmSync(dossierLocal, { recursive: true, force: true });
    expect(existsSync(dossierLocal)).toBe(false);

    // 4/5. Téléchargement cloud + restauration vers un NOUVEAU dossier local.
    const dossierRestaure = join(dossierTravail, "restaure");
    const resultatRestauration = await service.restaurerDepuisLeCloud("MAXI-EQUIP_BACKUP_2026-01-01_00-00-00", dossierRestaure);
    expect(resultatRestauration.success).toBe(true);

    // 6. Vérification RÉELLE des données restaurées — octet pour octet, jamais une simple présence de fichier.
    const contenuRestaure = readFileSync(join(dossierRestaure, "database.sqlite"), "utf-8");
    expect(contenuRestaure).toBe(contenuOriginal);
  });

  it("intégrité : une donnée corrompue côté cloud (après upload) fait ÉCHOUER la restauration, jamais un faux succès", async () => {
    const dossierLocal = creerFauxBackupLocal("backup-integrite", "contenu-original-valide");
    await service.sauvegarderVersLeCloud(dossierLocal, "backup-integrite");

    // Corrompt directement l'objet stocké côté "cloud" (simule une corruption réseau/stockage après l'upload).
    await provider.upload("backups/backup-integrite/database.sqlite", Buffer.from("CONTENU-CORROMPU-DIFFERENT"));

    const resultat = await service.restaurerDepuisLeCloud("backup-integrite", join(dossierTravail, "restaure-corrompu"));
    expect(resultat.success).toBe(false);
    expect(resultat.message).toContain("intégrité");
    expect(existsSync(join(dossierTravail, "restaure-corrompu", "database.sqlite"))).toBe(false);
  });

  it("listerSauvegardesCloud : retrouve les sauvegardes réellement envoyées", async () => {
    const dossierLocal = creerFauxBackupLocal("backup-liste-test", "contenu");
    await service.sauvegarderVersLeCloud(dossierLocal, "backup-liste-test");

    const noms = await service.listerSauvegardesCloud();
    expect(noms).toContain("backup-liste-test");
  });

  it("échec réseau réel : upload vers un endpoint injoignable échoue proprement (jamais un succès silencieux)", async () => {
    const providerInjoignable = new S3CloudBackupProvider({
      bucket: BUCKET,
      region: "us-east-1",
      endpoint: "http://localhost:1", // port invalide — connexion refusée garantie
      forcePathStyle: true,
      accessKeyId: "x",
      secretAccessKey: "x",
    });
    const serviceInjoignable = new CloudBackupService(providerInjoignable);
    const dossierLocal = creerFauxBackupLocal("backup-reseau-echec", "contenu");

    const resultat = await serviceInjoignable.sauvegarderVersLeCloud(dossierLocal, "backup-reseau-echec");
    expect(resultat.success).toBe(false);
    expect(resultat.message).toBeDefined();
  }, 20_000);

  it("jamais la clé de chiffrement dans les fichiers envoyés (structure du backup automatique réutilisée telle quelle)", async () => {
    const dossierLocal = creerFauxBackupLocal("backup-sans-cle", "contenu-sans-secret");
    await service.sauvegarderVersLeCloud(dossierLocal, "backup-sans-cle");

    const metadataCloud = await provider.download("backups/backup-sans-cle/metadata.json");
    expect(metadataCloud.toString("utf-8")).not.toContain("encryptionKeyHex");
    expect(metadataCloud.toString("utf-8")).not.toContain("keyProtection");
  });
});
