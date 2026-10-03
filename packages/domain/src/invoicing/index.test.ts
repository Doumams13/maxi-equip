import { describe, expect, it } from "vitest";
import {
  buildLigneFacture,
  buildLignesReleveInterne,
  calculerTotalLigne,
  calculerTotalFacture,
  calculerTotalNet,
  validerRemise,
  InvalidRemiseError,
  validerMontantPaye,
  calculerSoldeRestant,
  InvalidMontantPayeError,
  assertAucuneDonneeInterneExposee,
  InvalidInvoiceLineError,
  type VenteLigneSource,
} from "./index.js";

describe("Facturation — fusion interne/externe (règle critique §7)", () => {
  it("cas du cahier des charges : 20 cartons internes + 10 externes → une seule ligne de 30", () => {
    const source: VenteLigneSource = {
      produitId: "p1",
      motif: "Marbre Blanc",
      reference: "REF-MB-6060",
      taille: "60x60 cm",
      prixUnitaire: 8500,
      quantiteInterne: 20,
      quantiteExterne: 10,
      fournisseur: "Fournisseur XYZ",
      prixAchatExterne: 7000,
    };

    const ligne = buildLigneFacture(source);

    expect(ligne.quantite).toBe(30);
    expect(ligne.motif).toBe("Marbre Blanc");
    expect(ligne.reference).toBe("REF-MB-6060");
    expect(ligne.prixUnitaire).toBe(8500);
  });

  it("RÈGLE CRITIQUE : la ligne de facture ne contient structurellement aucun champ fournisseur/coût d'achat", () => {
    const source: VenteLigneSource = {
      produitId: "p1",
      motif: "Marbre Blanc",
      reference: "REF-MB-6060",
      taille: "60x60 cm",
      prixUnitaire: 8500,
      quantiteInterne: 20,
      quantiteExterne: 10,
      fournisseur: "Fournisseur XYZ",
      prixAchatExterne: 7000,
    };
    const ligne = buildLigneFacture(source);

    expect("fournisseur" in ligne).toBe(false);
    expect("prixAchat" in ligne).toBe(false);
    expect("quantiteExterne" in ligne).toBe(false);
    expect("quantiteInterne" in ligne).toBe(false);
    expect(() => assertAucuneDonneeInterneExposee(ligne)).not.toThrow();
  });

  it("fonctionne pour une ligne entièrement interne (aucune part externe)", () => {
    const ligne = buildLigneFacture({
      produitId: "p1",
      motif: "Grès Gris",
      reference: "REF-GG-3030",
      taille: "30x30 cm",
      prixUnitaire: 5000,
      quantiteInterne: 15,
      quantiteExterne: 0,
    });
    expect(ligne.quantite).toBe(15);
  });

  it("fonctionne pour une ligne entièrement externe (aucun stock disponible)", () => {
    const ligne = buildLigneFacture({
      produitId: "p1",
      motif: "Grès Gris",
      reference: "REF-GG-3030",
      taille: "30x30 cm",
      prixUnitaire: 5000,
      quantiteInterne: 0,
      quantiteExterne: 15,
      fournisseur: "Fournisseur ABC",
      prixAchatExterne: 4000,
    });
    expect(ligne.quantite).toBe(15);
  });

  it("rejette une ligne dont la quantité totale est nulle", () => {
    expect(() =>
      buildLigneFacture({
        produitId: "p1",
        motif: "Test",
        reference: "REF-TEST",
        taille: "1x1",
        prixUnitaire: 1000,
        quantiteInterne: 0,
        quantiteExterne: 0,
      })
    ).toThrow(InvalidInvoiceLineError);
  });

  it("rejette une part externe sans fournisseur ni coût d'achat renseignés", () => {
    expect(() =>
      buildLigneFacture({
        produitId: "p1",
        motif: "Test",
        reference: "REF-TEST",
        taille: "1x1",
        prixUnitaire: 1000,
        quantiteInterne: 5,
        quantiteExterne: 10,
      })
    ).toThrow(InvalidInvoiceLineError);
  });
});

describe("Relevé interne d'approvisionnement", () => {
  it("génère une ligne de relevé uniquement pour la part externe", () => {
    const sources: VenteLigneSource[] = [
      {
        produitId: "p1",
        motif: "Marbre Blanc",
        reference: "REF-MB-6060",
        taille: "60x60 cm",
        prixUnitaire: 8500,
        quantiteInterne: 20,
        quantiteExterne: 10,
        fournisseur: "Fournisseur XYZ",
        prixAchatExterne: 7000,
      },
    ];
    const releve = buildLignesReleveInterne(sources);
    expect(releve).toHaveLength(1);
    expect(releve[0]).toEqual({
      motif: "Marbre Blanc",
      taille: "60x60 cm",
      quantite: 10,
      fournisseur: "Fournisseur XYZ",
      prixAchat: 7000,
      prixVente: 8500,
    });
  });

  it("ne génère aucune ligne de relevé pour une source entièrement interne", () => {
    const sources: VenteLigneSource[] = [
      { produitId: "p1", motif: "Grès Gris", reference: "REF-GG-3030", taille: "30x30 cm", prixUnitaire: 5000, quantiteInterne: 15, quantiteExterne: 0 },
    ];
    expect(buildLignesReleveInterne(sources)).toHaveLength(0);
  });

  it("traite correctement un mélange de lignes internes et mixtes dans une même vente", () => {
    const sources: VenteLigneSource[] = [
      { produitId: "p1", motif: "Grès Gris", reference: "REF-GG-3030", taille: "30x30 cm", prixUnitaire: 5000, quantiteInterne: 15, quantiteExterne: 0 },
      {
        produitId: "p2",
        motif: "Marbre Blanc",
        reference: "REF-MB-6060",
        taille: "60x60 cm",
        prixUnitaire: 8500,
        quantiteInterne: 20,
        quantiteExterne: 10,
        fournisseur: "Fournisseur XYZ",
        prixAchatExterne: 7000,
      },
    ];
    const releve = buildLignesReleveInterne(sources);
    expect(releve).toHaveLength(1);
    expect(releve[0]?.motif).toBe("Marbre Blanc");
  });
});

describe("Calcul des totaux (§6 — recalcul automatique)", () => {
  it("calcule le total d'une ligne", () => {
    expect(calculerTotalLigne({ quantite: 30, prixUnitaire: 8500 })).toBe(255000);
  });

  it("calcule le total d'une facture à plusieurs lignes", () => {
    const total = calculerTotalFacture([
      { quantite: 30, prixUnitaire: 8500 },
      { quantite: 10, prixUnitaire: 5000 },
    ]);
    expect(total).toBe(305000);
  });

  it("gère une facture sans lignes (total nul)", () => {
    expect(calculerTotalFacture([])).toBe(0);
  });

  it("applique bien un prix unitaire différent du prix catalogue (§6 — prix modifiable pour une vente)", () => {
    // Le prix unitaire de la ligne peut différer du prix catalogue du produit
    // (négociation, remise ponctuelle) — le domaine ne connaît que le prix
    // de la ligne, jamais le prix catalogue à cette étape.
    const prixCatalogue = 8500;
    const prixNegocie = 8000;
    const ligne = buildLigneFacture({
      produitId: "p1",
      motif: "Marbre Blanc",
      reference: "REF-MB-6060",
      taille: "60x60 cm",
      prixUnitaire: prixNegocie,
      quantiteInterne: 10,
      quantiteExterne: 0,
    });
    expect(ligne.prixUnitaire).toBe(prixNegocie);
    expect(ligne.prixUnitaire).not.toBe(prixCatalogue);
    expect(calculerTotalLigne(ligne)).toBe(80000);
  });
});

describe("Séparation facture client / informations internes (§7, §11)", () => {
  it("détecte une fuite si un champ interdit apparaît dans un objet destiné au client", () => {
    const objetSuspect = { motif: "Test", fournisseur: "Ne devrait jamais être ici" };
    expect(() => assertAucuneDonneeInterneExposee(objetSuspect)).toThrow(InvalidInvoiceLineError);
  });

  it("n'échoue pas sur une vraie ligne de facture propre", () => {
    const ligne = buildLigneFacture({
      produitId: "p1",
      motif: "Test",
      reference: "REF-TEST",
      taille: "1x1",
      prixUnitaire: 1000,
      quantiteInterne: 5,
      quantiteExterne: 0,
    });
    expect(() => assertAucuneDonneeInterneExposee(ligne)).not.toThrow();
  });
});

describe("Remise / Négociation — correction dédiée", () => {
  it("cas du cahier des charges : 13 × 15 000 = 195 000, remise 2 000 → total net 193 000", () => {
    const total = 13 * 15000;
    expect(total).toBe(195000);
    expect(() => validerRemise(2000, total)).not.toThrow();
    expect(calculerTotalNet(total, 2000)).toBe(193000);
  });

  it("une remise de 0 est gérée normalement (jamais rejetée, total net = total)", () => {
    expect(() => validerRemise(0, 195000)).not.toThrow();
    expect(calculerTotalNet(195000, 0)).toBe(195000);
  });

  it("rejette une remise strictement supérieure au total", () => {
    expect(() => validerRemise(200000, 195000)).toThrow(InvalidRemiseError);
  });

  it("accepte une remise égale au total (total net = 0, jamais négatif)", () => {
    expect(() => validerRemise(195000, 195000)).not.toThrow();
    expect(calculerTotalNet(195000, 195000)).toBe(0);
  });

  it("rejette une remise négative", () => {
    expect(() => validerRemise(-500, 195000)).toThrow(InvalidRemiseError);
  });

  it("rejette une remise non finie (NaN/Infinity)", () => {
    expect(() => validerRemise(NaN, 195000)).toThrow(InvalidRemiseError);
    expect(() => validerRemise(Infinity, 195000)).toThrow(InvalidRemiseError);
  });

  it("calculerTotalNet ne descend jamais sous zéro même en cas d'appel sans validation préalable", () => {
    expect(calculerTotalNet(1000, 5000)).toBe(0);
  });
});

describe("Statut de paiement — Réservation / Acompte", () => {
  it("accepte une vente payée intégralement quand le montant payé égale le total net", () => {
    expect(() => validerMontantPaye("payee", 193000, 193000)).not.toThrow();
  });

  it("rejette une vente payée intégralement dont le montant payé diffère du total net", () => {
    expect(() => validerMontantPaye("payee", 190000, 193000)).toThrow(InvalidMontantPayeError);
    expect(() => validerMontantPaye("payee", 200000, 193000)).toThrow(InvalidMontantPayeError);
  });

  it("accepte une réservation avec un acompte strictement inférieur au total net, et calcule le solde restant", () => {
    expect(() => validerMontantPaye("reservation", 50000, 193000)).not.toThrow();
    expect(calculerSoldeRestant(193000, 50000)).toBe(143000);
  });

  it("rejette une réservation dont l'acompte est égal ou supérieur au total net", () => {
    expect(() => validerMontantPaye("reservation", 193000, 193000)).toThrow(InvalidMontantPayeError);
    expect(() => validerMontantPaye("reservation", 200000, 193000)).toThrow(InvalidMontantPayeError);
  });

  it("rejette un acompte nul ou négatif pour une réservation, et un montant négatif ou non fini quel que soit le statut", () => {
    expect(() => validerMontantPaye("reservation", 0, 193000)).toThrow(InvalidMontantPayeError);
    expect(() => validerMontantPaye("reservation", -1000, 193000)).toThrow(InvalidMontantPayeError);
    expect(() => validerMontantPaye("payee", NaN, 193000)).toThrow(InvalidMontantPayeError);
    expect(() => validerMontantPaye("payee", -1, 193000)).toThrow(InvalidMontantPayeError);
  });

  it("accepte un montant payé nul pour une vente payée dont le total net est nul (remise égale au total)", () => {
    expect(() => validerMontantPaye("payee", 0, 0)).not.toThrow();
  });

  it("calculerSoldeRestant ne descend jamais sous zéro même en cas d'appel sans validation préalable", () => {
    expect(calculerSoldeRestant(100000, 150000)).toBe(0);
  });
});
