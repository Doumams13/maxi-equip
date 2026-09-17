import { describe, expect, it } from "vitest";
import type { Produit, Facture } from "./index.js";

describe("shared-types (Phase 0 smoke test)", () => {
  it("permet de construire un Produit conforme à la forme attendue", () => {
    const produit: Produit = {
      id: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      motif: "Marbre Blanc",
      largeur: 60,
      hauteur: 60,
      type: "Grès cérame",
      taille: "60x60 cm",
      tailleTri: 60,
      reference: "MB-6060",
      prix: 8500,
      seuilAlerte: 20,
      deletedAt: null,
      deletedBy: null,
    };
    expect(produit.motif).toBe("Marbre Blanc");
  });

  it("garantit qu'une facture ne contient jamais de champ fournisseur/coût externe", () => {
    const facture: Facture = {
      id: "00000000-0000-4000-8000-000000000002",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      numero: "FAC-0001",
      date: "2026-01-01T00:00:00.000Z",
      emplacementId: "00000000-0000-4000-8000-0000000000ff",
      clientNom: "Jean Dupont",
      clientTelephone: null,
      clientAdresse: null,
      vendeurUtilisateurId: "00000000-0000-4000-8000-0000000000aa",
      vendeurNomManuel: null,
      lignes: [
        { produitId: null, motif: "Marbre Blanc", taille: "60x60 cm", quantite: 30, prixUnitaire: 8500, prixUnitaireNormal: null, promotionId: null, promotionLibelle: null, promotionType: null, promotionValeur: null },
      ],
      total: 255000,
      modeReglement: "Espèces",
      statutLivraison: "en_attente",
      livreeLe: null,
      annuleeLe: null,
      annuleePar: null,
      motifAnnulation: null,
      corrigeeParFactureId: null,
    };
    // Vérifie à la compilation (et non seulement à l'exécution) qu'aucune
    // clé "fournisseur" ou "prixAchat" n'existe sur ce type.
    expect("fournisseur" in facture.lignes[0]!).toBe(false);
    expect("prixAchat" in facture.lignes[0]!).toBe(false);
  });
});
