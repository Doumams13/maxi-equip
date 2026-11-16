import { describe, it, expect } from "vitest";
import { configurationUnitesPourSousCategorie, champsPourSousCategorie, erreurValidationVariante } from "./metier.js";
import type { ConfigurationUnitesSousCategorie, SousCategorieChamp } from "@maxi-equip/shared-types";

/**
 * Cohérence métier du catalogue (Phase 3 bis) — testé directement sur
 * les fonctions top-level exportées, sans mocker `ipcMain`/`electron`
 * (jamais fait dans ce projet, voir metier.catalogSync.test.ts). Les
 * repositories sont de faux objets satisfaisant la même interface,
 * même principe que venteService.test.ts.
 */

function fauxRepoUnites(config: ConfigurationUnitesSousCategorie) {
  return { obtenirConfiguration: () => config } as never;
}

function fauxRepoChamps(champs: SousCategorieChamp[]) {
  return { listBySousCategorie: () => champs } as never;
}

function champ(partiel: Partial<SousCategorieChamp> & { nom: string }): SousCategorieChamp {
  return {
    id: "c1",
    sousCategorieId: "sc1",
    type: "texte",
    obligatoire: false,
    valeursAutorisees: null,
    uniteMesure: null,
    role: null,
    ordre: 0,
    deletedAt: null,
    deletedBy: null,
    createdAt: "",
    updatedAt: "",
    ...partiel,
  };
}

describe("configurationUnitesPourSousCategorie / champsPourSousCategorie — repli par défaut", () => {
  it("sousCategorieId null/undefined n'est jamais restreint (produit non classé)", () => {
    expect(configurationUnitesPourSousCategorie(fauxRepoUnites({ configuree: true, unites: ["carton"] }), null)).toEqual({ configuree: false, unites: [] });
    expect(configurationUnitesPourSousCategorie(fauxRepoUnites({ configuree: true, unites: ["carton"] }), undefined)).toEqual({ configuree: false, unites: [] });
  });

  it("repository absent (non disponible) n'est jamais restreint", () => {
    expect(configurationUnitesPourSousCategorie(undefined, "sc1")).toEqual({ configuree: false, unites: [] });
    expect(champsPourSousCategorie(undefined, "sc1")).toEqual([]);
  });

  it("sousCategorieId renseigné délègue au repository", () => {
    expect(configurationUnitesPourSousCategorie(fauxRepoUnites({ configuree: true, unites: ["sac"] }), "sc1")).toEqual({ configuree: true, unites: ["sac"] });
    expect(champsPourSousCategorie(fauxRepoChamps([champ({ nom: "Diamètre" })]), "sc1").map((c) => c.nom)).toEqual(["Diamètre"]);
  });
});

describe("erreurValidationVariante — création/ajout de variante (toujours inconditionnel)", () => {
  it("null (aucune erreur) quand l'unité est compatible et aucune caractéristique obligatoire ne manque", () => {
    const erreur = erreurValidationVariante(fauxRepoUnites({ configuree: false, unites: [] }), fauxRepoChamps([]), "sc1", "sac", null);
    expect(erreur).toBeNull();
  });

  it("signale une unité incompatible", () => {
    const erreur = erreurValidationVariante(fauxRepoUnites({ configuree: true, unites: ["carton"] }), fauxRepoChamps([]), "sc1", "litre", null);
    expect(erreur).toMatch(/n'est pas autorisée/);
  });

  it("signale une caractéristique obligatoire manquante", () => {
    const erreur = erreurValidationVariante(
      fauxRepoUnites({ configuree: false, unites: [] }),
      fauxRepoChamps([champ({ nom: "Diamètre", obligatoire: true })]),
      "sc1",
      "piece",
      null
    );
    expect(erreur).toMatch(/Diamètre/);
  });

  it("aucune sous-catégorie (non classé) : jamais restreint, jamais d'obligatoire", () => {
    const erreur = erreurValidationVariante(fauxRepoUnites({ configuree: true, unites: ["carton"] }), fauxRepoChamps([champ({ nom: "Diamètre", obligatoire: true })]), null, "litre", null);
    expect(erreur).toBeNull();
  });
});
