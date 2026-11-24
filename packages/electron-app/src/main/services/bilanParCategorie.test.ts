import { describe, it, expect } from "vitest";
import { produitCorrespondAuFiltre, ventesParCategorie, ventilerParUnite, topProduitsDepuisLignes, type ClassementProduit, type LigneVendue } from "./bilanParCategorie.js";

const carrelage: ClassementProduit = { produitId: "p1", categorieId: "c1", categorieNom: "Carrelage et revêtements", sousCategorieId: "s1", sousCategorieNom: "Carreaux", estCarreau: true };
const ciment: ClassementProduit = { produitId: "p2", categorieId: "c2", categorieNom: "Matériaux de construction", sousCategorieId: "s2", sousCategorieNom: "Ciment", estCarreau: false };
const classement = new Map([carrelage, ciment].map((c) => [c.produitId, c]));

function ligne(p: Partial<LigneVendue>): LigneVendue {
  return { factureId: "f1", produitId: "p1", quantite: 1, prixUnitaire: 1000, uniteVente: null, reference: "R1", motif: "M", taille: "T", ...p };
}

describe("bilan par catégorie", () => {
  it("filtre : sans filtre tout correspond ; sous-catégorie prioritaire sur catégorie ; produit non classé exclu dès qu'un filtre est actif", () => {
    expect(produitCorrespondAuFiltre(undefined, null)).toBe(true);
    expect(produitCorrespondAuFiltre(carrelage, { categorieId: "c1" })).toBe(true);
    expect(produitCorrespondAuFiltre(ciment, { categorieId: "c1" })).toBe(false);
    expect(produitCorrespondAuFiltre(carrelage, { categorieId: "c1", sousCategorieId: "s9" })).toBe(false);
    expect(produitCorrespondAuFiltre(undefined, { categorieId: "c1" })).toBe(false);
  });

  it("ventes par catégorie : CA, quantités par unité (jamais mélangées), part du total, tri décroissant, non classé regroupé", () => {
    const resultat = ventesParCategorie(
      [
        ligne({ produitId: "p1", quantite: 10, prixUnitaire: 12960 }),
        ligne({ factureId: "f2", produitId: "p1", quantite: 2, prixUnitaire: 12960, uniteVente: "piece" }),
        ligne({ produitId: "p2", quantite: 20, prixUnitaire: 4500, uniteVente: "sac" }),
        ligne({ produitId: null, quantite: 1, prixUnitaire: 500 }),
      ],
      classement
    );
    expect(resultat.map((r) => r.categorieNom)).toEqual(["Carrelage et revêtements", "Matériaux de construction", "Non classé"]);
    expect(resultat[0]!.chiffreAffaires).toBe(155520);
    expect(resultat[0]!.quantites).toEqual([
      { unite: "carton", quantite: 10 },
      { unite: "piece", quantite: 2 },
    ]);
    expect(resultat[1]!.quantites).toEqual([{ unite: "sac", quantite: 20 }]);
    const sommeParts = resultat.reduce((s, r) => s + r.part, 0);
    expect(sommeParts).toBeCloseTo(1, 10);
  });

  it("ventilation par unité et top produits depuis les lignes", () => {
    expect(ventilerParUnite([["p1", 5], ["p2", 3], ["p3", 0]], new Map([["p1", "carton"], ["p2", "sac"]]))).toEqual([
      { unite: "carton", quantite: 5 },
      { unite: "sac", quantite: 3 },
    ]);
    expect(topProduitsDepuisLignes([ligne({ reference: "A", quantite: 2 }), ligne({ reference: "B", quantite: 5 }), ligne({ reference: "A", quantite: 4 })], 1)).toEqual([{ label: "A", quantite: 6 }]);
  });
});
