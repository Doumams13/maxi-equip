import { describe, expect, it } from "vitest";
import {
  validerConfigurationUnites,
  ConfigurationUniteVideError,
  unitesEffectivesPourSousCategorie,
  uniteEstCompatible,
  validerUniteCompatible,
  IncompatibiliteUniteError,
  valeurEffectivementModifiee,
  champsObligatoiresManquants,
  validerCaracteristiquesObligatoires,
  CaracteristiquesObligatoiresManquantesError,
  detecterDoublonsPotentiels,
} from "./index.js";
import type { ConfigurationUnitesSousCategorie, SousCategorieChamp } from "@maxi-equip/shared-types";

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

describe("validerConfigurationUnites — jamais une configuration vide", () => {
  it("accepte une liste non vide", () => {
    expect(() => validerConfigurationUnites(["carton"])).not.toThrow();
  });

  it("rejette une liste vide", () => {
    expect(() => validerConfigurationUnites([])).toThrow(ConfigurationUniteVideError);
  });
});

describe("unitesEffectivesPourSousCategorie — non configurée vs configurée", () => {
  it("non configurée (configuree:false) renvoie les 6 unités, quel que soit le contenu de `unites`", () => {
    const config: ConfigurationUnitesSousCategorie = { configuree: false, unites: [] };
    expect(unitesEffectivesPourSousCategorie(config)).toEqual(["carton", "piece", "sac", "metre", "kg", "litre"]);
  });

  it("configurée renvoie exactement la liste configurée, jamais un repli sur les 6 unités", () => {
    const config: ConfigurationUnitesSousCategorie = { configuree: true, unites: ["piece", "carton"] };
    expect(unitesEffectivesPourSousCategorie(config)).toEqual(["piece", "carton"]);
  });
});

describe("uniteEstCompatible / validerUniteCompatible", () => {
  it("toute unité est compatible pour une sous-catégorie non configurée", () => {
    const config: ConfigurationUnitesSousCategorie = { configuree: false, unites: [] };
    expect(uniteEstCompatible("litre", config)).toBe(true);
    expect(() => validerUniteCompatible("litre", config)).not.toThrow();
  });

  it("une unité absente de la configuration est rejetée", () => {
    const config: ConfigurationUnitesSousCategorie = { configuree: true, unites: ["carton", "piece"] };
    expect(uniteEstCompatible("litre", config)).toBe(false);
    expect(() => validerUniteCompatible("litre", config)).toThrow(IncompatibiliteUniteError);
  });

  it("une unité présente dans la configuration est acceptée", () => {
    const config: ConfigurationUnitesSousCategorie = { configuree: true, unites: ["carton", "piece"] };
    expect(() => validerUniteCompatible("piece", config)).not.toThrow();
  });
});

describe("valeurEffectivementModifiee — principe de non-régression réutilisé partout", () => {
  it("undefined n'est jamais un changement effectif", () => {
    expect(valeurEffectivementModifiee(undefined, "carton")).toBe(false);
  });

  it("une valeur identique à l'actuelle n'est pas un changement effectif", () => {
    expect(valeurEffectivementModifiee("carton", "carton")).toBe(false);
    expect(valeurEffectivementModifiee(null, null)).toBe(false);
  });

  it("une valeur différente de l'actuelle EST un changement effectif", () => {
    expect(valeurEffectivementModifiee("piece", "carton")).toBe(true);
    expect(valeurEffectivementModifiee(null, "carton")).toBe(true);
  });
});

describe("champsObligatoiresManquants / validerCaracteristiquesObligatoires", () => {
  it("aucun champ obligatoire configuré → jamais rien de manquant", () => {
    const champs = [champ({ nom: "Finition", obligatoire: false })];
    expect(champsObligatoiresManquants(champs, [])).toEqual([]);
  });

  it("un champ obligatoire absent des entrées est signalé", () => {
    const champs = [champ({ nom: "Diamètre", obligatoire: true })];
    expect(champsObligatoiresManquants(champs, [])).toEqual(["Diamètre"]);
    expect(() => validerCaracteristiquesObligatoires(champs, [])).toThrow(CaracteristiquesObligatoiresManquantesError);
  });

  it("un champ obligatoire présent avec une valeur vide est toujours signalé manquant", () => {
    const champs = [champ({ nom: "Diamètre", obligatoire: true })];
    expect(champsObligatoiresManquants(champs, [{ cle: "Diamètre", valeur: "   " }])).toEqual(["Diamètre"]);
  });

  it("un champ obligatoire renseigné (insensible à la casse) n'est jamais signalé", () => {
    const champs = [champ({ nom: "Diamètre", obligatoire: true })];
    expect(champsObligatoiresManquants(champs, [{ cle: "diamètre", valeur: "100 mm" }])).toEqual([]);
    expect(() => validerCaracteristiquesObligatoires(champs, [{ cle: "diamètre", valeur: "100 mm" }])).not.toThrow();
  });

  it("plusieurs champs obligatoires manquants sont tous listés", () => {
    const champs = [champ({ nom: "Diamètre", obligatoire: true }), champ({ nom: "Longueur", obligatoire: true }), champ({ nom: "Matière", obligatoire: false })];
    expect(champsObligatoiresManquants(champs, [])).toEqual(["Diamètre", "Longueur"]);
  });
});

describe("detecterDoublonsPotentiels — Phase 5 (référentiel commun), sous-phase 5.7", () => {
  it("deux entités de même nom, identifiants différents : détectées comme UN groupe de doublons", () => {
    const entites = [
      { id: "a", nom: "Électricité" },
      { id: "b", nom: "Électricité" },
    ];
    const groupes = detecterDoublonsPotentiels(entites);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.nom).toBe("Électricité");
    expect(groupes[0]!.occurrences.map((o) => o.id).sort()).toEqual(["a", "b"]);
  });

  it("deux noms qui ne diffèrent que par la casse sont considérés comme identiques", () => {
    const entites = [
      { id: "a", nom: "Électricité" },
      { id: "b", nom: "ÉLECTRICITÉ" },
      { id: "c", nom: "électricité" },
    ];
    const groupes = detecterDoublonsPotentiels(entites);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.occurrences).toHaveLength(3);
  });

  it("deux noms différents ne sont jamais regroupés", () => {
    const entites = [
      { id: "a", nom: "Électricité" },
      { id: "b", nom: "Plomberie" },
    ];
    expect(detecterDoublonsPotentiels(entites)).toEqual([]);
  });

  it("deux enregistrements avec le MÊME identifiant ne sont jamais considérés comme des doublons", () => {
    const entites = [
      { id: "a", nom: "Électricité" },
      { id: "a", nom: "Électricité" },
    ];
    expect(detecterDoublonsPotentiels(entites)).toEqual([]);
  });

  it("une seule entité (aucune autre occurrence du même nom) ne forme jamais un groupe", () => {
    const entites = [{ id: "a", nom: "Électricité" }];
    expect(detecterDoublonsPotentiels(entites)).toEqual([]);
  });

  it("un jeu sans aucun doublon retourne un résultat vide", () => {
    const entites = [
      { id: "a", nom: "Électricité" },
      { id: "b", nom: "Plomberie" },
      { id: "c", nom: "Peinture" },
    ];
    expect(detecterDoublonsPotentiels(entites)).toEqual([]);
  });

  it("un jeu vide retourne un résultat vide", () => {
    expect(detecterDoublonsPotentiels([])).toEqual([]);
  });

  it("cleScope (ex. catégorie parente d'une sous-catégorie) restreint le rapprochement : même nom, scope différent → jamais regroupé", () => {
    const entites = [
      { id: "a", nom: "Carreaux", categorieId: "cat-1" },
      { id: "b", nom: "Carreaux", categorieId: "cat-2" },
    ];
    expect(detecterDoublonsPotentiels(entites, (e) => e.categorieId)).toEqual([]);
  });

  it("cleScope : même nom, MÊME scope → regroupé", () => {
    const entites = [
      { id: "a", nom: "Carreaux", categorieId: "cat-1" },
      { id: "b", nom: "Carreaux", categorieId: "cat-1" },
      { id: "c", nom: "Carreaux", categorieId: "cat-2" },
    ];
    const groupes = detecterDoublonsPotentiels(entites, (e) => e.categorieId);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.occurrences.map((o) => o.id).sort()).toEqual(["a", "b"]);
  });

  it("ne fabrique ni ne modifie jamais les entités fournies — occurrences = les mêmes objets, références préservées", () => {
    const x = { id: "a", nom: "Électricité", createdAt: "2026-01-01T00:00:00.000Z" };
    const y = { id: "b", nom: "Électricité", createdAt: "2026-01-02T00:00:00.000Z" };
    const groupes = detecterDoublonsPotentiels([x, y]);
    expect(groupes[0]!.occurrences).toContain(x);
    expect(groupes[0]!.occurrences).toContain(y);
  });
});
