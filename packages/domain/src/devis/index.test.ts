import { describe, it, expect } from "vitest";
import { calculerLigneDevis, calculerTotauxDevis } from "./index.js";

describe("devis proforma — calculs", () => {
  it("reproduit les lignes du modèle fourni (remise 5 % et 10 %, ciment sans remise)", () => {
    expect(calculerLigneDevis({ quantite: 10, prixUnitaire: 8415, remisePourcent: 5 })).toEqual({ brut: 84150, remise: 4208, net: 79942 });
    expect(calculerLigneDevis({ quantite: 32, prixUnitaire: 12960, remisePourcent: 5 })).toEqual({ brut: 414720, remise: 20736, net: 393984 });
    expect(calculerLigneDevis({ quantite: 7, prixUnitaire: 12480, remisePourcent: 10 })).toEqual({ brut: 87360, remise: 8736, net: 78624 });
    expect(calculerLigneDevis({ quantite: 105, prixUnitaire: 4500, remisePourcent: 0 })).toEqual({ brut: 472500, remise: 0, net: 472500 });
  });

  it("totaux : remise totale = remises des lignes + remise globale, jamais un net négatif", () => {
    const lignes = [
      { quantite: 10, prixUnitaire: 8415, remisePourcent: 5 },
      { quantite: 105, prixUnitaire: 4500, remisePourcent: 0 },
    ];
    expect(calculerTotauxDevis(lignes)).toEqual({ brut: 556650, remiseLignes: 4208, remiseGlobale: 0, remiseTotale: 4208, net: 552442 });
    expect(calculerTotauxDevis(lignes, 2442).net).toBe(550000);
    expect(calculerTotauxDevis(lignes, 10_000_000).net).toBe(0);
  });

  it("pourcentage hors bornes ramené entre 0 et 100", () => {
    expect(calculerLigneDevis({ quantite: 1, prixUnitaire: 1000, remisePourcent: -5 }).remise).toBe(0);
    expect(calculerLigneDevis({ quantite: 1, prixUnitaire: 1000, remisePourcent: 150 }).net).toBe(0);
  });
});
