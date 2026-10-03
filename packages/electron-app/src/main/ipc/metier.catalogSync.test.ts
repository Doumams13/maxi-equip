import { describe, it, expect, vi } from "vitest";
import type { ModeleProduit, Produit } from "@maxi-equip/shared-types";
import { enqueueModeleSync, enqueueProduitSync } from "./metier.js";

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
  seuilAlerte: 5,
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
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("transmet l'opération demandée (update/delete)", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueModeleSync(boiteEnvoi as never, MODELE, "delete");
    expect(boiteEnvoi.creer).toHaveBeenCalledWith("modele", "modele-1", expect.objectContaining({ operation: "delete" }));
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
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const payloadEnvoye = boiteEnvoi.creer.mock.calls[0]![2] as Record<string, unknown>;
    expect(payloadEnvoye).not.toHaveProperty("seuilAlerte");
  });

  it("ignore silencieusement une variante sans modèle parent (chemin catalogue legacy) — jamais envoyée", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    enqueueProduitSync(boiteEnvoi as never, { ...PRODUIT, modeleId: null }, "create");
    expect(boiteEnvoi.creer).not.toHaveBeenCalled();
  });
});
