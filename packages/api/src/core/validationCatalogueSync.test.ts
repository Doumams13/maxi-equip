import { describe, it, expect } from "vitest";
import {
  validerOperationModele,
  validerOperationProduit,
  validerOperationCategorie,
  validerOperationSousCategorie,
  validerOperationSousCategorieChamp,
} from "./validationCatalogueSync.js";
import { ValidationError } from "./errors.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.1 — tests ciblés des
 * validateurs ajoutés/étendus. Portée STRICTEMENT limitée à la
 * validation : aucun test ici n'exerce push.ts (non modifié dans cette
 * sous-phase) ni les repositories locaux Electron.
 */

const MODELE_ID = "11111111-1111-4111-8111-111111111111";
const SOUS_CATEGORIE_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORIE_ID = "33333333-3333-4333-8333-333333333333";
const PRODUIT_ID = "44444444-4444-4444-8444-444444444444";
const CHAMP_ID = "55555555-5555-4555-8555-555555555555";

describe("validerOperationModele — champs Phase 5 (sousCategorieId, marque)", () => {
  function payloadBase() {
    return { operation: "create", modeleId: MODELE_ID, motif: "Marbre", type: "Faïence", ordreVitrine: null, updatedAt: "2026-01-01T00:00:00.000Z" };
  }

  it("rétrocompatibilité : accepte un payload SANS sousCategorieId/marque (ancien poste), les deux deviennent null", () => {
    const resultat = validerOperationModele(payloadBase());
    expect(resultat.sousCategorieId).toBeNull();
    expect(resultat.marque).toBeNull();
  });

  it("accepte sousCategorieId/marque renseignés", () => {
    const resultat = validerOperationModele({ ...payloadBase(), sousCategorieId: SOUS_CATEGORIE_ID, marque: "Ciment Gabonais" });
    expect(resultat.sousCategorieId).toBe(SOUS_CATEGORIE_ID);
    expect(resultat.marque).toBe("Ciment Gabonais");
  });

  it("accepte sousCategorieId/marque explicitement null", () => {
    const resultat = validerOperationModele({ ...payloadBase(), sousCategorieId: null, marque: null });
    expect(resultat.sousCategorieId).toBeNull();
    expect(resultat.marque).toBeNull();
  });

  it("rejette un sousCategorieId qui n'est pas un UUID valide", () => {
    expect(() => validerOperationModele({ ...payloadBase(), sousCategorieId: "pas-un-uuid" })).toThrow(ValidationError);
  });

  it("rejette une marque qui n'est pas une chaîne", () => {
    expect(() => validerOperationModele({ ...payloadBase(), marque: 42 })).toThrow(ValidationError);
  });
});

describe("validerOperationProduit — champs Phase 5 (uniteVente, caracteristiques, marque)", () => {
  function payloadBase() {
    return {
      operation: "create",
      produitId: PRODUIT_ID,
      modeleId: MODELE_ID,
      taille: "60x60",
      tailleTri: 3600,
      largeur: 60,
      hauteur: 60,
      reference: "REF-1",
      prix: 15000,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("rétrocompatibilité : accepte un payload SANS les 3 champs (ancien poste), tous deviennent null", () => {
    const resultat = validerOperationProduit(payloadBase());
    expect(resultat.uniteVente).toBeNull();
    expect(resultat.caracteristiques).toBeNull();
    expect(resultat.marque).toBeNull();
  });

  it("accepte une unité de vente valide", () => {
    const resultat = validerOperationProduit({ ...payloadBase(), uniteVente: "sac" });
    expect(resultat.uniteVente).toBe("sac");
  });

  it("rejette une unité de vente invalide", () => {
    expect(() => validerOperationProduit({ ...payloadBase(), uniteVente: "tonneau" })).toThrow(ValidationError);
  });

  it("caracteristiques : transmis TEL QUEL (chaîne JSON déjà sérialisée), jamais reparsé", () => {
    const json = JSON.stringify([{ cle: "Diamètre", valeur: "100 mm" }]);
    const resultat = validerOperationProduit({ ...payloadBase(), caracteristiques: json });
    expect(resultat.caracteristiques).toBe(json);
  });

  it("rejette caracteristiques qui n'est pas une chaîne", () => {
    expect(() => validerOperationProduit({ ...payloadBase(), caracteristiques: { cle: "x" } })).toThrow(ValidationError);
  });

  it("accepte marque renseignée", () => {
    const resultat = validerOperationProduit({ ...payloadBase(), marque: "Lafarge" });
    expect(resultat.marque).toBe("Lafarge");
  });
});

describe("validerOperationCategorie", () => {
  function payloadBase() {
    return { operation: "create", categorieId: CATEGORIE_ID, nom: "Quincaillerie générale", ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" };
  }

  it("accepte un payload minimal valide (imageDataUrl absente → null)", () => {
    const resultat = validerOperationCategorie(payloadBase());
    expect(resultat).toMatchObject({ categorieId: CATEGORIE_ID, nom: "Quincaillerie générale", ordre: 0, imageDataUrl: null });
  });

  it("accepte une imageDataUrl renseignée", () => {
    const resultat = validerOperationCategorie({ ...payloadBase(), imageDataUrl: "data:image/png;base64,AAAA" });
    expect(resultat.imageDataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("rejette un categorieId invalide", () => {
    expect(() => validerOperationCategorie({ ...payloadBase(), categorieId: "pas-un-uuid" })).toThrow(ValidationError);
  });

  it("rejette un nom vide", () => {
    expect(() => validerOperationCategorie({ ...payloadBase(), nom: "" })).toThrow(ValidationError);
  });

  it("rejette une opération invalide", () => {
    expect(() => validerOperationCategorie({ ...payloadBase(), operation: "archiver" })).toThrow(ValidationError);
  });
});

describe("validerOperationSousCategorie — configuration d'unités en sous-objet", () => {
  function payloadBase() {
    return {
      operation: "create",
      sousCategorieId: SOUS_CATEGORIE_ID,
      categorieId: CATEGORIE_ID,
      nom: "Carreaux",
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("non configurée : modelePhysique/unitesAutorisees absents → null", () => {
    const resultat = validerOperationSousCategorie(payloadBase());
    expect(resultat.modelePhysique).toBeNull();
    expect(resultat.unitesAutorisees).toBeNull();
  });

  it("accepte modelePhysique = 'carreau'", () => {
    const resultat = validerOperationSousCategorie({ ...payloadBase(), modelePhysique: "carreau" });
    expect(resultat.modelePhysique).toBe("carreau");
  });

  it("rejette un modelePhysique inconnu", () => {
    expect(() => validerOperationSousCategorie({ ...payloadBase(), modelePhysique: "liquide" })).toThrow(ValidationError);
  });

  it("accepte une configuration d'unités explicite — TRANSMISE COMME SOUS-OBJET de la sous-catégorie, jamais une entité séparée", () => {
    const resultat = validerOperationSousCategorie({ ...payloadBase(), unitesAutorisees: ["sac", "kg"] });
    expect(resultat.unitesAutorisees).toEqual(["sac", "kg"]);
  });

  it("rejette une liste d'unités VIDE — même règle que domain/catalogue.validerConfigurationUnites côté app : une configuration explicite autorise toujours au moins une unité", () => {
    expect(() => validerOperationSousCategorie({ ...payloadBase(), unitesAutorisees: [] })).toThrow(ValidationError);
  });

  it("rejette une unité invalide dans la liste", () => {
    expect(() => validerOperationSousCategorie({ ...payloadBase(), unitesAutorisees: ["sac", "tonneau"] })).toThrow(ValidationError);
  });
});

describe("validerOperationSousCategorieChamp — tombstone (deleted_at), jamais physique", () => {
  function payloadBase() {
    return {
      operation: "create",
      champId: CHAMP_ID,
      sousCategorieId: SOUS_CATEGORIE_ID,
      nom: "Diamètre",
      type: "nombre",
      obligatoire: false,
      ordre: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("accepte un champ minimal valide", () => {
    const resultat = validerOperationSousCategorieChamp(payloadBase());
    expect(resultat).toMatchObject({ nom: "Diamètre", type: "nombre", obligatoire: false, valeursAutorisees: null, uniteMesure: null, role: null });
  });

  it("rejette un type de champ inconnu", () => {
    expect(() => validerOperationSousCategorieChamp({ ...payloadBase(), type: "date" })).toThrow(ValidationError);
  });

  it("accepte une liste de valeurs autorisées (type liste)", () => {
    const resultat = validerOperationSousCategorieChamp({ ...payloadBase(), type: "liste", valeursAutorisees: ["Rouge", "Bleu"] });
    expect(resultat.valeursAutorisees).toEqual(["Rouge", "Bleu"]);
  });

  it("accepte un rôle valide", () => {
    const resultat = validerOperationSousCategorieChamp({ ...payloadBase(), role: "physique" });
    expect(resultat.role).toBe("physique");
  });

  it("rejette un rôle inconnu", () => {
    expect(() => validerOperationSousCategorieChamp({ ...payloadBase(), role: "secondaire" })).toThrow(ValidationError);
  });

  it("suppression : operation='delete' reste un payload valide (le tombstone est appliqué côté storage, pas ici)", () => {
    const resultat = validerOperationSousCategorieChamp({ ...payloadBase(), operation: "delete" });
    expect(resultat.operation).toBe("delete");
  });
});
