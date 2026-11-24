import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DOSSIER = mkdtempSync(join(tmpdir(), "etat-sauvegarde-cloud-"));
vi.mock("electron", () => ({ app: { getPath: () => DOSSIER } }));

const { lireEtatSauvegardeCloud, noterEchecSauvegardeCloud, noterReussiteSauvegardeCloud, initialiserDerniereReussiteSiInconnue, diagnostiquer } = await import(
  "./etatSauvegardeCloud.js"
);

const JOUR = 86_400_000;

describe("état de la sauvegarde cloud", () => {
  it("persiste réussite/échec et n'initialise la date cloud que si inconnue", () => {
    expect(lireEtatSauvegardeCloud()).toEqual({ derniereReussite: null, dernierEchec: null });
    initialiserDerniereReussiteSiInconnue("2026-10-26T08:42:19.000Z");
    expect(lireEtatSauvegardeCloud().derniereReussite).toBe("2026-10-26T08:42:19.000Z");
    initialiserDerniereReussiteSiInconnue("2026-01-01T00:00:00.000Z");
    expect(lireEtatSauvegardeCloud().derniereReussite).toBe("2026-10-26T08:42:19.000Z");
    noterEchecSauvegardeCloud("espace insuffisant", "2026-11-24T02:00:00.000Z");
    expect(lireEtatSauvegardeCloud().dernierEchec).toEqual({ date: "2026-11-24T02:00:00.000Z", message: "espace insuffisant" });
    noterReussiteSauvegardeCloud("2026-11-24T03:00:00.000Z");
    expect(lireEtatSauvegardeCloud().derniereReussite).toBe("2026-11-24T03:00:00.000Z");
  });

  it("diagnostic : problème si échec plus récent que la réussite, ou réussite trop ancienne ; jamais si non configurée", () => {
    const maintenant = new Date("2026-11-24T12:00:00.000Z").getTime();
    const recente = new Date(maintenant - JOUR).toISOString();
    const ancienne = new Date(maintenant - 29 * JOUR).toISOString();
    expect(diagnostiquer({ derniereReussite: recente, dernierEchec: null }, true, maintenant).probleme).toBe(false);
    expect(diagnostiquer({ derniereReussite: ancienne, dernierEchec: null }, true, maintenant).probleme).toBe(true);
    expect(diagnostiquer({ derniereReussite: recente, dernierEchec: { date: new Date(maintenant).toISOString(), message: "x" } }, true, maintenant).probleme).toBe(true);
    expect(diagnostiquer({ derniereReussite: recente, dernierEchec: { date: ancienne, message: "x" } }, true, maintenant).probleme).toBe(false);
    expect(diagnostiquer({ derniereReussite: ancienne, dernierEchec: null }, false, maintenant).probleme).toBe(false);
  });
});
