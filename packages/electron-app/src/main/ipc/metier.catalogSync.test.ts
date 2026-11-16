import { describe, it, expect, vi } from "vitest";
import type { ModeleProduit, Produit, Categorie, SousCategorie, SousCategorieChamp } from "@maxi-equip/shared-types";
import { enqueueModeleSync, enqueueProduitSync, enqueueCategorieSync, enqueueSousCategorieSync, enqueueSousCategorieChampSync } from "./metier.js";

/**
 * Tests ciblés de la mise en attente de synchronisation catalogue
 * (correction "Intégration Site Phase 5, Partie 2") — vérifie la forme
 * exacte du payload envoyé à la boîte d'envoi, sans passer par
 * `ipcMain` (jamais mocké dans ce projet — voir l'absence de tout
 * `vi.mock("electron")` ailleurs — ces deux fonctions sont pures et
 * exportées spécifiquement pour rester testables directement).
 */

function makeBoiteEnvoi() {
  return { creer: vi.fn<[string, string, unknown], string>(() => "envoi-1") };
}

const MODELE: ModeleProduit = {
  id: "modele-1",
  motif: "Marbre Blanc",
  type: "Faïence",
  ordreVitrine: null,
  sousCategorieId: null,
  marque: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const PRODUIT: Produit = {
  id: "produit-1",
  modeleId: "modele-1",
  motif: "Marbre Blanc",
  type: "Faïence",
  taille: "60x60",
  tailleTri: 3600,
  largeur: 60,
  hauteur: 60,
  reference: "MB-6060",
  prix: 15000,
  carreauxParCarton: 4,
  seuilAlerte: 5,
  uniteVente: null,
  caracteristiques: null,
  marque: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

describe("enqueueModeleSync", () => {
  it("met en attente une opération 'modele' avec le bon type d'entité et le bon payload", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueModeleSync(boiteEnvoi as never, MODELE, "create");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("modele", "modele-1", {
      operation: "create",
      modeleId: "modele-1",
      motif: "Marbre Blanc",
      type: "Faïence",
      ordreVitrine: null,
      sousCategorieId: null,
      marque: null,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("transmet ordreVitrine quand le modèle est sélectionné pour la vitrine", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueModeleSync(boiteEnvoi as never, { ...MODELE, ordreVitrine: 2 }, "update");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("modele", "modele-1", expect.objectContaining({ ordreVitrine: 2 }));
  });

  it("transmet l'opération demandée (update/delete)", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueModeleSync(boiteEnvoi as never, MODELE, "delete");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("modele", "modele-1", expect.objectContaining({ operation: "delete" }));
  });

  it("Phase 5 (référentiel commun), sous-phase 5.5 : transmet sousCategorieId et marque quand ils sont renseignés sur le modèle local — valeurs issues du repository, jamais inventées", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueModeleSync(boiteEnvoi as never, { ...MODELE, sousCategorieId: "sc-1", marque: "Somany" }, "update");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("modele", "modele-1", expect.objectContaining({ sousCategorieId: "sc-1", marque: "Somany" }));
  });
});

describe("enqueueProduitSync", () => {
  it("met en attente une opération 'produit' — jamais de seuilAlerte (donnée interne)", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueProduitSync(boiteEnvoi as never, PRODUIT, "update");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("produit", "produit-1", {
      operation: "update",
      produitId: "produit-1",
      modeleId: "modele-1",
      taille: "60x60",
      tailleTri: 3600,
      largeur: 60,
      hauteur: 60,
      reference: "MB-6060",
      prix: 15000,
      uniteVente: null,
      caracteristiques: null,
      marque: null,
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const payloadEnvoye = boiteEnvoi.creer.mock.calls[0]![2] as Record<string, unknown>;
    expect(payloadEnvoye).not.toHaveProperty("seuilAlerte");
  });

  it("Phase 5 (référentiel commun), sous-phase 5.5 : transmet uniteVente, caracteristiques et marque quand ils sont renseignés sur le produit local — valeurs issues du repository, jamais inventées", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueProduitSync(boiteEnvoi as never, { ...PRODUIT, uniteVente: "sac", caracteristiques: '{"poids":"25kg"}', marque: "Nicoll" }, "update");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith(
      "produit",
      "produit-1",
      expect.objectContaining({ uniteVente: "sac", caracteristiques: '{"poids":"25kg"}', marque: "Nicoll" })
    );
  });

  it("ignore silencieusement une variante sans modèle parent (chemin catalogue legacy) — jamais envoyée", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueProduitSync(boiteEnvoi as never, { ...PRODUIT, modeleId: null }, "create");
    expect(boiteEnvoi.creer).not.toHaveBeenCalled();
  });
});

/**
 * Phase 5 (référentiel commun), sous-phase 5.3 — mêmes principes que
 * ci-dessus (fonctions pures exportées, testées sans `ipcMain`).
 */

const CATEGORIE: Categorie = {
  id: "categorie-1",
  nom: "Quincaillerie générale",
  imageDataUrl: null,
  ordre: 0,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const SOUS_CATEGORIE: SousCategorie = {
  id: "sous-categorie-1",
  categorieId: "categorie-1",
  nom: "Ciments et liants",
  ordre: 0,
  modelePhysique: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

const CHAMP: SousCategorieChamp = {
  id: "champ-1",
  sousCategorieId: "sous-categorie-1",
  nom: "Poids",
  type: "nombre",
  obligatoire: true,
  valeursAutorisees: null,
  uniteMesure: "kg",
  role: "physique",
  ordre: 0,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-04T00:00:00.000Z",
};

describe("enqueueCategorieSync", () => {
  it("met en attente une opération 'categorie' avec le bon type d'entité et le bon payload", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueCategorieSync(boiteEnvoi as never, CATEGORIE, "create");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("categorie", "categorie-1", {
      operation: "create",
      categorieId: "categorie-1",
      nom: "Quincaillerie générale",
      imageDataUrl: null,
      ordre: 0,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("transmet l'opération demandée (update/delete)", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueCategorieSync(boiteEnvoi as never, CATEGORIE, "delete");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("categorie", "categorie-1", expect.objectContaining({ operation: "delete" }));
  });
});

describe("enqueueSousCategorieSync — unités autorisées transmises en sous-objet, jamais une opération indépendante", () => {
  it("met en attente une opération 'sous_categorie' (type d'entité unique, aucun type 'unites' séparé) avec le bon payload", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueSousCategorieSync(boiteEnvoi as never, SOUS_CATEGORIE, null, "create");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("sous_categorie", "sous-categorie-1", {
      operation: "create",
      sousCategorieId: "sous-categorie-1",
      categorieId: "categorie-1",
      nom: "Ciments et liants",
      ordre: 0,
      modelePhysique: null,
      unitesAutorisees: null,
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    // Un seul appel à creer() — jamais un deuxième appel "unites" séparé.
    expect(boiteEnvoi.creer).toHaveBeenCalledTimes(1);
  });

  it("transmet une configuration d'unités explicite dans le MÊME payload", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueSousCategorieSync(boiteEnvoi as never, SOUS_CATEGORIE, ["sac", "kg"], "update");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("sous_categorie", "sous-categorie-1", expect.objectContaining({ unitesAutorisees: ["sac", "kg"] }));
    expect(boiteEnvoi.creer).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueSousCategorieChampSync", () => {
  it("met en attente une opération 'sous_categorie_champ' avec le bon payload complet", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueSousCategorieChampSync(boiteEnvoi as never, CHAMP, "create");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("sous_categorie_champ", "champ-1", {
      operation: "create",
      champId: "champ-1",
      sousCategorieId: "sous-categorie-1",
      nom: "Poids",
      type: "nombre",
      obligatoire: true,
      valeursAutorisees: null,
      uniteMesure: "kg",
      role: "physique",
      ordre: 0,
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
  });

  it("transmet valeursAutorisees pour un champ de type liste", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueSousCategorieChampSync(boiteEnvoi as never, { ...CHAMP, type: "liste", valeursAutorisees: ["Rouge", "Bleu"] }, "update");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("sous_categorie_champ", "champ-1", expect.objectContaining({ type: "liste", valeursAutorisees: ["Rouge", "Bleu"] }));
  });

  it("transmet l'opération 'delete'", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueSousCategorieChampSync(boiteEnvoi as never, CHAMP, "delete");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("sous_categorie_champ", "champ-1", expect.objectContaining({ operation: "delete" }));
  });
});
