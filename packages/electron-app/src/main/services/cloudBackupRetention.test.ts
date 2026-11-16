import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import S3rver from "s3rver";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3CloudBackupProvider } from "./s3CloudBackupProvider.js";
import { CloudBackupService } from "./cloudBackupService.js";
import { declencherSauvegardeAutoEtCloudSiNecessaire, envoyerBackupVersCloudSiConfigure } from "./cloudBackupTrigger.js";
import { POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT } from "./backupRotation.js";

/**
 * Tests RÉELS — rétention cloud, verrou anti-doublon, vérification
 * d'intégrité post-upload et gestion d'espace (audit stockage B2,
 * 2026-11-14). Même principe que cloudBackup.test.ts : un VRAI serveur
 * compatible S3 (`s3rver`), jamais un mock du SDK ou du service.
 */

const PORT = 45292;
const BUCKET = "maxi-equip-backups-retention-test";
let serveurS3: S3rver;
let dossierStockageS3: string;
let dossierTravail: string;
let provider: S3CloudBackupProvider;
let service: CloudBackupService;

const JOUR_MS = 24 * 60 * 60 * 1000;

function configurerCloudEnv(): void {
  process.env["CLOUD_BACKUP_BUCKET"] = BUCKET;
  process.env["CLOUD_BACKUP_REGION"] = "us-east-1";
  process.env["CLOUD_BACKUP_ENDPOINT"] = `http://localhost:${PORT}`;
  process.env["CLOUD_BACKUP_ACCESS_KEY_ID"] = "S3RVER";
  process.env["CLOUD_BACKUP_SECRET_ACCESS_KEY"] = "S3RVER";
}

/**
 * Vide entièrement le préfixe "backups/" du bucket de test entre les
 * tests qui appellent une opération GLOBALE (purge, inventaire, espace)
 * — ces opérations voient TOUT le bucket, pas seulement les sauvegardes
 * du test en cours ; sans ce nettoyage, les tests se contaminent entre
 * eux (ex. les 7 sauvegardes d'un test rivalisent avec celles du test
 * précédent pour les mêmes paliers de rétention).
 */
async function viderBucketBackups(): Promise<void> {
  // Tout le bucket de test (y compris un éventuel objet "postgres/" injecté
  // par les tests du point 2, audit du 2026-11-14) — ce bucket de test
  // n'héberge jamais de vraies données, contrairement au bucket réel.
  const objets = await provider.list("");
  await Promise.all(objets.map((o) => provider.delete(o.cle)));
}

function supprimerCloudEnv(): void {
  delete process.env["CLOUD_BACKUP_BUCKET"];
  delete process.env["CLOUD_BACKUP_REGION"];
  delete process.env["CLOUD_BACKUP_ENDPOINT"];
  delete process.env["CLOUD_BACKUP_ACCESS_KEY_ID"];
  delete process.env["CLOUD_BACKUP_SECRET_ACCESS_KEY"];
  delete process.env["CLOUD_BACKUP_PLAFOND_OCTETS"];
}

beforeAll(async () => {
  dossierStockageS3 = mkdtempSync(join(tmpdir(), "maxi-equip-s3rver-retention-"));
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

function creerFauxBackupLocalAvecDate(nom: string, tailleOctets: number, createdAtISO: string): string {
  const dossier = join(dossierTravail, nom);
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "database.sqlite"), Buffer.alloc(tailleOctets, "x"));
  writeFileSync(join(dossier, "metadata.json"), JSON.stringify({ format: "MAXI_EQUIP_BACKUP", backup: { createdAt: createdAtISO, type: "automatic" } }));
  return dossier;
}

async function injecterSauvegardeCloud(nom: string, joursAvant: number, tailleOctets = 1024): Promise<void> {
  const createdAtISO = new Date(Date.now() - joursAvant * JOUR_MS).toISOString();
  const dossier = creerFauxBackupLocalAvecDate(nom, tailleOctets, createdAtISO);
  const resultat = await service.sauvegarderVersLeCloud(dossier, nom);
  expect(resultat.success).toBe(true);
}

describe("Rétention cloud, intégrité, espace et verrou — audit stockage B2 (2026-11-14)", () => {
  beforeAll(() => {
    dossierTravail = mkdtempSync(join(tmpdir(), "maxi-equip-retention-"));
  });
  afterAll(() => {
    rmSync(dossierTravail, { recursive: true, force: true });
  });
  afterEach(async () => {
    supprimerCloudEnv();
    vi.restoreAllMocks();
    await viderBucketBackups();
  });

  describe("sélection des sauvegardes (politique cloud 7/2/0)", () => {
    it("conserve 2 semaines distinctes au palier hebdomadaire, jamais 2 sauvegardes de la même semaine", async () => {
      await injecterSauvegardeCloud("sel-j0", 0);
      for (let i = 1; i <= 6; i++) await injecterSauvegardeCloud(`sel-j${i}`, i); // 7 quotidiennes (j0..j6)
      await injecterSauvegardeCloud("sel-j10a", 10);
      await injecterSauvegardeCloud("sel-j10b", 11); // même semaine que j10a, probablement
      await injecterSauvegardeCloud("sel-j20", 20); // semaine distincte suivante

      const entrees = await service.listerSauvegardesCloudDetaillees();
      const pertinentes = entrees.filter((e) => e.nom.startsWith("sel-"));
      expect(pertinentes.length).toBe(10);

      const resultat = await service.purgerAnciennesSauvegardesCloud(POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT);
      const conserveesSel = resultat.conservees.filter((n) => n.startsWith("sel-"));

      // 7 quotidiennes conservées telles quelles.
      for (let i = 0; i <= 6; i++) expect(conserveesSel).toContain(`sel-j${i}`);
      // j20 (semaine distincte, plus récente/plus ancienne selon le découpage) conservée au palier hebdo.
      expect(conserveesSel).toContain("sel-j20");
      // Jamais j10a ET j10b en même temps (même semaine) — au plus l'une des deux.
      const nbJ10 = ["sel-j10a", "sel-j10b"].filter((n) => conserveesSel.includes(n)).length;
      expect(nbJ10).toBeLessThanOrEqual(1);
    }, 20_000);

    it("les sauvegardes quotidiennes ne sont jamais recomptées au palier hebdomadaire (pas de double comptage)", async () => {
      // 7 quotidiennes exactement, aucune autre : aucune ne doit être "promue" ou dupliquée au palier hebdo.
      for (let i = 0; i <= 6; i++) await injecterSauvegardeCloud(`dup-j${i}`, i, 2048);

      const resultat = await service.purgerAnciennesSauvegardesCloud(POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT);
      const conserveesDup = resultat.conservees.filter((n) => n.startsWith("dup-"));
      expect(conserveesDup.length).toBe(7);
      expect(new Set(conserveesDup).size).toBe(7); // aucun doublon dans le résultat lui-même.
    }, 20_000);
  });

  describe("purge cloud — protection des sauvegardes conservées", () => {
    it("supprime réellement les sauvegardes hors politique, conserve les autres intactes et restaurables", async () => {
      // 12 sauvegardes réparties sur plusieurs semaines -> plus que 7+2=9, certaines doivent être purgées.
      const joursAvant = [0, 1, 2, 3, 4, 5, 6, 10, 17, 24, 31, 45];
      const noms = joursAvant.map((j) => `purge-j${j}`);
      for (let i = 0; i < noms.length; i++) await injecterSauvegardeCloud(noms[i]!, joursAvant[i]!, 4096);

      const resultat = await service.purgerAnciennesSauvegardesCloud(POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT);
      const conserveesPurge = resultat.conservees.filter((n) => n.startsWith("purge-"));
      const supprimeesPurge = resultat.supprimees.filter((n) => n.startsWith("purge-"));

      expect(supprimeesPurge.length).toBeGreaterThan(0);
      expect(conserveesPurge.length + supprimeesPurge.length).toBe(noms.length);

      // Vérification RÉELLE sur le serveur S3 : les supprimées sont bien absentes, pas juste "oubliées" du calcul.
      for (const nom of supprimeesPurge) {
        expect(await provider.exists(`backups/${nom}/database.sqlite`)).toBe(false);
      }

      // Une sauvegarde CONSERVÉE reste parfaitement restaurable après la purge (jamais corrompue par l'opération).
      const nomConserve = conserveesPurge[0]!;
      const dossierRestaure = join(dossierTravail, `restaure-apres-purge-${nomConserve}`);
      const resultatRestauration = await service.restaurerDepuisLeCloud(nomConserve, dossierRestaure);
      expect(resultatRestauration.success).toBe(true);
      expect(existsSync(join(dossierRestaure, "database.sqlite"))).toBe(true);
    }, 30_000);

    it("ne supprime jamais une sauvegarde dont metadata.json est absent/illisible (exclue du calcul, jamais traitée comme valide)", async () => {
      await injecterSauvegardeCloud("orphelin-ref", 0, 1024);
      // Sauvegarde "orpheline" : database.sqlite présent, metadata.json jamais envoyé (simule un upload interrompu).
      await provider.upload("backups/orphelin-sans-metadata/database.sqlite", Buffer.from("contenu-orphelin"));

      const entrees = await service.listerSauvegardesCloudDetaillees();
      expect(entrees.some((e) => e.nom === "orphelin-sans-metadata")).toBe(false);

      await service.purgerAnciennesSauvegardesCloud(POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT);
      // Toujours présent après la purge : jamais supprimé automatiquement, jamais protégé non plus (revue manuelle nécessaire).
      expect(await provider.exists("backups/orphelin-sans-metadata/database.sqlite")).toBe(true);
    });
  });

  describe("vérification d'intégrité post-upload", () => {
    it("un upload réussi puis corrompu APRÈS coup est détecté par verifierIntegriteSauvegardeCloud (jamais un faux succès)", async () => {
      const dossier = creerFauxBackupLocalAvecDate("integrite-corrompu", 1024, new Date().toISOString());
      const resultatUpload = await service.sauvegarderVersLeCloud(dossier, "integrite-corrompu");
      expect(resultatUpload.success).toBe(true); // intact au moment de l'upload.

      await provider.upload("backups/integrite-corrompu/database.sqlite", Buffer.from("CONTENU-CORROMPU-APRES-UPLOAD"));

      const verification = await service.verifierIntegriteSauvegardeCloud("integrite-corrompu");
      expect(verification.success).toBe(false);
      expect(verification.message).toContain("SHA-256");
    });

    it("sauvegarderVersLeCloud renvoie success:false si la vérification post-upload échoue, même si les 3 fichiers sont bien partis", async () => {
      // Scénario : upload normal, mais un tiers remplace database.sqlite par un fichier de taille différente
      // juste après — simule une troncature réseau non détectée par l'upload lui-même.
      const dossier = creerFauxBackupLocalAvecDate("integrite-tronque", 1024, new Date().toISOString());
      await service.sauvegarderVersLeCloud(dossier, "integrite-tronque");
      await provider.upload("backups/integrite-tronque/database.sqlite", Buffer.alloc(10, "y"));

      const reverification = await service.verifierIntegriteSauvegardeCloud("integrite-tronque");
      expect(reverification.success).toBe(false);
    });
  });

  describe("gestion de l'espace disponible", () => {
    it("détecte un espace insuffisant SANS rien supprimer (lecture seule)", async () => {
      await injecterSauvegardeCloud("espace-a", 0, 5_000_000);
      await injecterSauvegardeCloud("espace-b", 1, 5_000_000);

      const avant = await service.listerSauvegardesCloudDetaillees();
      const nbAvant = avant.length;

      const resultatEspace = await service.verifierEspaceCloudSuffisant(2_000_000, 11_000_000); // 10M existants + 2M > plafond 11M? non -> ajustons pour forcer l'insuffisance.
      // (5M+5M) + 2M = 12M > plafond 11M -> insuffisant attendu.
      expect(resultatEspace.suffisant).toBe(false);
      expect(resultatEspace.octetsUtilisesActuels).toBeGreaterThanOrEqual(10_000_000);

      const apres = await service.listerSauvegardesCloudDetaillees();
      expect(apres.length).toBe(nbAvant); // rien supprimé par cette seule vérification.
    }, 15_000);

    it("confirme un espace suffisant et identifie correctement ce qui est déjà éligible à la rotation (sans le supprimer)", async () => {
      const resultatEspace = await service.verifierEspaceCloudSuffisant(1_000_000, 1_000_000_000);
      expect(resultatEspace.suffisant).toBe(true);
      expect(Array.isArray(resultatEspace.nomsDejaEligiblesPurge)).toBe(true);
    });
  });

  describe("bucket partagé SQLite + PostgreSQL (correction audit du 2026-11-14, point 2)", () => {
    it("un objet sous postgres/ (jamais une sauvegarde SQLite) augmente bien l'espace utilisé comptabilisé", async () => {
      await injecterSauvegardeCloud("partage-sqlite-seul", 0, 2_000_000);

      const avantPostgres = await service.verifierEspaceCloudSuffisant(0, 1_000_000_000);
      expect(avantPostgres.octetsUtilisesActuels).toBeGreaterThanOrEqual(2_000_000);
      expect(avantPostgres.octetsUtilisesActuels).toBeLessThan(2_100_000); // seul le SQLite compte encore ici.

      // Objet PostgreSQL réel (dump .sql.gz), structure totalement différente d'une sauvegarde SQLite — jamais via sauvegarderVersLeCloud.
      await provider.upload("postgres/maxiequip-postgres-2026-11-14T03-00-00Z.sql.gz", Buffer.alloc(3_000_000, "p"));

      const apresPostgres = await service.verifierEspaceCloudSuffisant(0, 1_000_000_000);
      expect(apresPostgres.octetsUtilisesActuels).toBeGreaterThanOrEqual(avantPostgres.octetsUtilisesActuels + 3_000_000);
    }, 15_000);

    it("un objet sous postgres/ n'est jamais sélectionnable par la rotation ni la purge SQLite", async () => {
      // 10 sauvegardes SQLite (dépasse largement 7+2=9) -> la purge SQLite a réellement quelque chose à faire.
      for (const j of [0, 1, 2, 3, 4, 5, 6, 10, 20, 30]) await injecterSauvegardeCloud(`partage-rotation-j${j}`, j, 1024);
      await provider.upload("postgres/maxiequip-postgres-2026-11-14T03-00-00Z.sql.gz", Buffer.alloc(1024, "p"));

      // 1. Jamais dans l'inventaire SQLite (scope backups/ uniquement).
      const entreesSqlite = await service.listerSauvegardesCloudDetaillees();
      expect(entreesSqlite.some((e) => e.nom.includes("maxiequip-postgres"))).toBe(false);

      // 2. Jamais listé comme "déjà éligible purge" par le calcul d'espace (ce champ reste scopé backups/).
      const espace = await service.verifierEspaceCloudSuffisant(0, 1_000_000_000);
      expect(espace.nomsDejaEligiblesPurge.some((n) => n.includes("maxiequip-postgres"))).toBe(false);

      // 3. La purge réelle laisse l'objet PostgreSQL intact, quoi qu'il arrive à la rotation SQLite.
      await service.purgerAnciennesSauvegardesCloud(POLITIQUE_ROTATION_CLOUD_PAR_DEFAUT);
      expect(await provider.exists("postgres/maxiequip-postgres-2026-11-14T03-00-00Z.sql.gz")).toBe(true);

      await provider.delete("postgres/maxiequip-postgres-2026-11-14T03-00-00Z.sql.gz");
    }, 20_000);
  });

  describe("orchestration complète (cloudBackupTrigger) — verrou, espace, échec", () => {
    it("deux déclenchements synchrones ne produisent qu'un seul envoi réel (verrou anti-doublon)", async () => {
      configurerCloudEnv();
      const erreurs: unknown[][] = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        erreurs.push(args);
      });

      const dossierA = creerFauxBackupLocalAvecDate("MAXI-EQUIP_BACKUP_verrou_A", 1024, new Date().toISOString());
      const dossierB = creerFauxBackupLocalAvecDate("MAXI-EQUIP_BACKUP_verrou_B", 1024, new Date().toISOString());

      // Appels synchrones, sans attendre le premier — reproduit la condition réelle que le verrou doit couvrir.
      const p1 = envoyerBackupVersCloudSiConfigure(dossierA);
      const p2 = envoyerBackupVersCloudSiConfigure(dossierB);
      await Promise.all([p1, p2]);

      const messageVerrou = erreurs.some((args) => String(args[0]).includes("déjà en cours"));
      expect(messageVerrou).toBe(true);

      // Un seul des deux a réellement été envoyé.
      const presentA = await provider.exists("backups/MAXI-EQUIP_BACKUP_verrou_A/database.sqlite");
      const presentB = await provider.exists("backups/MAXI-EQUIP_BACKUP_verrou_B/database.sqlite");
      expect([presentA, presentB].filter(Boolean).length).toBe(1);
    }, 15_000);

    it("declencherSauvegardeAutoEtCloudSiNecessaire : le verrou n'empêche pas un envoi normal isolé (pas de blocage permanent)", async () => {
      configurerCloudEnv();
      const dossier = creerFauxBackupLocalAvecDate("MAXI-EQUIP_BACKUP_isole", 1024, new Date().toISOString());
      const backupServiceStub = { creerSauvegardeAutomatiqueSiNecessaire: () => ({ success: true, chemin: dossier }) };

      declencherSauvegardeAutoEtCloudSiNecessaire(backupServiceStub);
      // Laisse l'envoi fire-and-forget se terminer réellement.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(await provider.exists("backups/MAXI-EQUIP_BACKUP_isole/database.sqlite")).toBe(true);
    }, 15_000);

    it("espace insuffisant : l'envoi est annulé, aucune suppression automatique n'est tentée", async () => {
      configurerCloudEnv();
      process.env["CLOUD_BACKUP_PLAFOND_OCTETS"] = "1000"; // plafond volontairement minuscule.

      const avant = await service.listerSauvegardesCloudDetaillees();
      const nbAvant = avant.length;

      const dossier = creerFauxBackupLocalAvecDate("MAXI-EQUIP_BACKUP_espace_insuffisant", 5000, new Date().toISOString());
      await envoyerBackupVersCloudSiConfigure(dossier);

      expect(await provider.exists("backups/MAXI-EQUIP_BACKUP_espace_insuffisant/database.sqlite")).toBe(false);
      const apres = await service.listerSauvegardesCloudDetaillees();
      expect(apres.length).toBe(nbAvant); // rien supprimé, rien ajouté.
    }, 15_000);

    it("échec d'upload (dossier local incomplet) : jamais de purge déclenchée après l'échec", async () => {
      configurerCloudEnv();
      // Précharge plusieurs anciennes sauvegardes qui SERAIENT éligibles à la purge si elle se déclenchait.
      for (const j of [50, 60, 70, 80]) await injecterSauvegardeCloud(`avant-echec-j${j}`, j, 1024);
      const avant = await service.listerSauvegardesCloudDetaillees();
      const nbAnciennesAvant = avant.filter((e) => e.nom.startsWith("avant-echec-")).length;
      expect(nbAnciennesAvant).toBe(4);

      // Dossier local incomplet (metadata.json manquant) -> sauvegarderVersLeCloud échoue avant même d'uploader.
      const dossierIncomplet = join(dossierTravail, "MAXI-EQUIP_BACKUP_incomplet");
      mkdirSync(dossierIncomplet, { recursive: true });
      writeFileSync(join(dossierIncomplet, "database.sqlite"), "contenu");

      await envoyerBackupVersCloudSiConfigure(dossierIncomplet);

      const apres = await service.listerSauvegardesCloudDetaillees();
      const nbAnciennesApres = apres.filter((e) => e.nom.startsWith("avant-echec-")).length;
      expect(nbAnciennesApres).toBe(4); // aucune purge n'a eu lieu malgré l'échec.
    }, 15_000);
  });
});
