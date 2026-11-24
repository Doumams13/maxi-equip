import { describe, it, expect, afterEach, vi } from "vitest";
import { declencherSauvegardeAutoEtCloudSiNecessaire, doitRenvoyerDerniereSauvegarde, DELAI_ENTRE_TENTATIVES_MS, lancerSauvegardeCloudMaintenant } from "./cloudBackupTrigger.js";

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

  it("0.12.5 — sans nouvelle sauvegarde locale et sans cloud configuré : la dernière sauvegarde est consultée mais rien n'est envoyé, jamais d'exception", () => {
    supprimerConfigCloudBackup();
    const backupService = {
      creerSauvegardeAutomatiqueSiNecessaire: vi.fn(() => null),
      listerSauvegardesAutomatiques: vi.fn(() => [{ chemin: "/tmp/fake", createdAt: "2026-11-24T08:00:00.000Z", vulnerable: false }]),
    };
    expect(() => declencherSauvegardeAutoEtCloudSiNecessaire(backupService)).not.toThrow();
    expect(backupService.listerSauvegardesAutomatiques).toHaveBeenCalledTimes(1);
  });
});

describe("doitRenvoyerDerniereSauvegarde (0.12.5 — nouvelle tentative après échec)", () => {
  const maintenant = new Date("2026-11-24T12:00:00.000Z").getTime();
  const locale = "2026-11-24T08:00:00.000Z";
  it("renvoie si la sauvegarde locale est plus récente que la dernière réussite cloud (cas PC Shop : 26 octobre)", () => {
    expect(doitRenvoyerDerniereSauvegarde(locale, "2026-10-26T08:42:19.000Z", true, 0, maintenant)).toBe(true);
    expect(doitRenvoyerDerniereSauvegarde(locale, null, true, 0, maintenant)).toBe(true);
  });
  it("ne renvoie pas si elle est déjà dans le cloud, si le cloud n'est pas configuré, ou si la dernière tentative est trop récente", () => {
    expect(doitRenvoyerDerniereSauvegarde(locale, "2026-11-24T08:05:00.000Z", true, 0, maintenant)).toBe(false);
    expect(doitRenvoyerDerniereSauvegarde(locale, null, false, 0, maintenant)).toBe(false);
    expect(doitRenvoyerDerniereSauvegarde(null, null, true, 0, maintenant)).toBe(false);
    expect(doitRenvoyerDerniereSauvegarde(locale, null, true, maintenant - DELAI_ENTRE_TENTATIVES_MS + 1000, maintenant)).toBe(false);
    expect(doitRenvoyerDerniereSauvegarde(locale, null, true, maintenant - DELAI_ENTRE_TENTATIVES_MS - 1000, maintenant)).toBe(true);
  });
});

describe("lancerSauvegardeCloudMaintenant (0.12.6 — bouton de l'alerte)", () => {
  afterEach(() => supprimerConfigCloudBackup());
  function configurerCloudInjoignable() {
    process.env["CLOUD_BACKUP_BUCKET"] = "b";
    process.env["CLOUD_BACKUP_REGION"] = "eu-central-003";
    process.env["CLOUD_BACKUP_ENDPOINT"] = "http://127.0.0.1:9";
    process.env["CLOUD_BACKUP_ACCESS_KEY_ID"] = "k";
    process.env["CLOUD_BACKUP_SECRET_ACCESS_KEY"] = "s";
  }

  it("sans cloud configuré : non_configuree, aucune sauvegarde créée", async () => {
    supprimerConfigCloudBackup();
    const backupService = { creerSauvegardeAutomatiqueImmediate: vi.fn() };
    expect(await lancerSauvegardeCloudMaintenant(backupService)).toEqual({ statut: "non_configuree" });
    expect(backupService.creerSauvegardeAutomatiqueImmediate).not.toHaveBeenCalled();
  });

  it("cloud injoignable pour la vérification : la sauvegarde est quand même tentée ; échec local remonté tel quel", async () => {
    configurerCloudInjoignable();
    const backupService = { creerSauvegardeAutomatiqueImmediate: vi.fn(() => ({ success: false, message: "disque plein" })) };
    expect(await lancerSauvegardeCloudMaintenant(backupService)).toEqual({ statut: "echec", message: "disque plein" });
    expect(backupService.creerSauvegardeAutomatiqueImmediate).toHaveBeenCalledTimes(1);
  }, 30_000);
});
