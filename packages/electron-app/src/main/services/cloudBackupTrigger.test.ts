import { describe, it, expect, afterEach, vi } from "vitest";
import { declencherSauvegardeAutoEtCloudSiNecessaire } from "./cloudBackupTrigger.js";

/**
 * Tests réels — système multiposte fiable (2026-10-28). Couvre la
 * logique de déclenchement (`declencherSauvegardeAutoEtCloudSiNecessaire`),
 * extraite de main/index.ts. `envoyerBackupVersCloudSiConfigure` elle-même
 * (upload S3 réel) n'a jamais eu de test dédié — comportement inchangé
 * par cette extraction, voir son commentaire ("best-effort").
 */

function supprimerConfigCloudBackup() {
  delete process.env["CLOUD_BACKUP_BUCKET"];
  delete process.env["CLOUD_BACKUP_REGION"];
  delete process.env["CLOUD_BACKUP_ENDPOINT"];
  delete process.env["CLOUD_BACKUP_ACCESS_KEY_ID"];
  delete process.env["CLOUD_BACKUP_SECRET_ACCESS_KEY"];
}

describe("declencherSauvegardeAutoEtCloudSiNecessaire", () => {
  afterEach(() => {
    supprimerConfigCloudBackup();
  });

  it("BackupService renvoie null (throttle 24h déjà actif) : jamais d'exception, rien de plus tenté", () => {
    const backupService = { creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => null) };

    expect(() => declencherSauvegardeAutoEtCloudSiNecessaire(backupService)).not.toThrow();
    expect(backupService.creerSauvegardeAutomatiqueSiNecessaire).toHaveBeenCalledTimes(1);
  });

  it("BackupService renvoie success:false : jamais d'exception", () => {
    const backupService = { creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => ({ success: false, message: "échec" })) };

    expect(() => declencherSauvegardeAutoEtCloudSiNecessaire(backupService)).not.toThrow();
  });

  it("BackupService renvoie success:true sans cloud configuré : jamais d'exception, aucun appel réseau tenté (vérifié par l'absence de crash malgré aucune config)", () => {
    supprimerConfigCloudBackup();
    const backupService = { creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => ({ success: true, chemin: "/tmp/fake-backup" })) };

    expect(() => declencherSauvegardeAutoEtCloudSiNecessaire(backupService)).not.toThrow();
  });

  it("une exception levée par BackupService est rattrapée, jamais remontée à l'appelant", () => {
    const backupService = {
      creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => {
        throw new Error("disque plein");
      }),
    };

    expect(() => declencherSauvegardeAutoEtCloudSiNecessaire(backupService)).not.toThrow();
  });
});
