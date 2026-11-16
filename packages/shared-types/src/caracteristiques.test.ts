import { describe, expect, it } from "vitest";
import { parseCaracteristiques, serialiserCaracteristiques, caracteristiquesAffichage, fusionnerCaracteristiquesSuggerees } from "./caracteristiques.js";

describe("caracteristiques — paires clé/valeur (fondations quincaillerie)", () => {
  it("aller-retour : sérialise puis reparse des paires identiques", () => {
    const entries = [{ cle: "Diamètre", valeur: "100 mm" }, { cle: "Longueur", valeur: "4 m" }];
    const serialise = serialiserCaracteristiques(entries);
    expect(parseCaracteristiques(serialise)).toEqual(entries);
  });

  it("affichage lisible, paires jointes par ' · '", () => {
    const serialise = serialiserCaracteristiques([{ cle: "Diamètre", valeur: "100 mm" }, { cle: "Longueur", valeur: "4 m" }]);
    expect(caracteristiquesAffichage(serialise)).toBe("Diamètre : 100 mm · Longueur : 4 m");
  });

  it("RÉTROCOMPATIBILITÉ : une ancienne valeur texte libre (pré-extension) n'est jamais interprétée comme du JSON cassé — restituée telle quelle", () => {
    const legacy = "Sac 50kg — CIM II 42.5";
    expect(parseCaracteristiques(legacy)).toEqual([{ cle: "", valeur: legacy }]);
    expect(caracteristiquesAffichage(legacy)).toBe(legacy);
  });

  it("paires vides (clé ET valeur blanches) filtrées, jamais stockées", () => {
    expect(serialiserCaracteristiques([{ cle: "  ", valeur: "  " }, { cle: "Couleur", valeur: "Blanc" }])).toBe(
      JSON.stringify([{ cle: "Couleur", valeur: "Blanc" }])
    );
  });

  it("aucune paire renseignée → null (équivalent à 'aucune caractéristique', comportement historique)", () => {
    expect(serialiserCaracteristiques([])).toBeNull();
    expect(serialiserCaracteristiques([{ cle: "", valeur: "" }])).toBeNull();
  });

  it("null/undefined/chaîne vide → aucune entrée, affichage vide, jamais une exception", () => {
    expect(parseCaracteristiques(null)).toEqual([]);
    expect(parseCaracteristiques(undefined)).toEqual([]);
    expect(parseCaracteristiques("")).toEqual([]);
    expect(caracteristiquesAffichage(null)).toBe("");
  });

  it("JSON valide mais de forme inattendue (ex. un objet, pas un tableau de {cle,valeur}) traité comme legacy, jamais une exception", () => {
    const jsonInattendu = JSON.stringify({ diametre: "100mm" });
    expect(parseCaracteristiques(jsonInattendu)).toEqual([{ cle: "", valeur: jsonInattendu }]);
  });
});

describe("fusionnerCaracteristiquesSuggerees — formulaires adaptés par catégorie", () => {
  it("ajoute les champs suggérés absents, vides, avant les entrées déjà saisies", () => {
    const existantes = [{ cle: "Diamètre", valeur: "100 mm" }];
    const resultat = fusionnerCaracteristiquesSuggerees(existantes, ["Diamètre", "Longueur", "Pression nominale"]);
    expect(resultat).toEqual([
      { cle: "Longueur", valeur: "" },
      { cle: "Pression nominale", valeur: "" },
      { cle: "Diamètre", valeur: "100 mm" },
    ]);
  });

  it("ne touche JAMAIS une valeur déjà saisie, même si son nom correspond à une suggestion (insensible à la casse)", () => {
    const existantes = [{ cle: "diamètre", valeur: "100 mm" }];
    const resultat = fusionnerCaracteristiquesSuggerees(existantes, ["Diamètre"]);
    expect(resultat).toEqual([{ cle: "diamètre", valeur: "100 mm" }]);
  });

  it("conserve les champs ad hoc (sans correspondance dans les suggestions), jamais supprimés", () => {
    const existantes = [{ cle: "Remarque libre", valeur: "abîmé en stock" }];
    const resultat = fusionnerCaracteristiquesSuggerees(existantes, ["Diamètre"]);
    expect(resultat).toEqual([
      { cle: "Diamètre", valeur: "" },
      { cle: "Remarque libre", valeur: "abîmé en stock" },
    ]);
  });

  it("aucune suggestion → renvoie les entrées existantes inchangées", () => {
    const existantes = [{ cle: "Couleur", valeur: "Blanc" }];
    expect(fusionnerCaracteristiquesSuggerees(existantes, [])).toEqual(existantes);
  });
});
