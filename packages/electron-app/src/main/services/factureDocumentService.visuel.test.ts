import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Correction "PRIX/M² sur deux lignes" (2026-10-22, retour utilisateur
 * visuel — capture d'écran montrant "15 000 FCFA" coupé sur 2 lignes dans
 * la colonne PRIX/M²). Même principe de vérification RÉELLE que
 * bilanDocumentService.test.ts : le PDF est réellement généré par pdfkit
 * puis relu par pdfjs-dist pour observer les positions/segments de texte
 * RÉELS — un calcul manuel de largeur de colonne avait déjà fait manquer
 * ce chevauchement une première fois sur ce document.
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "facture-pdf-test-"));

vi.mock("electron", () => ({
  app: { getPath: () => DOSSIER_TEMP },
}));

const { genererFacturePdf } = await import("./factureDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const IDENTITE_TEST = {
  nom: "MAXI EQUIP",
  adresse: "Libreville",
  quartier: "",
  telephones: ["077000000"],
  nomAdministrateur: null,
  nomGerant: null,
};

const MAINTENANT = "2026-10-22T10:00:00.000Z";

function construireFacture(overrides: Partial<Facture> = {}): Facture {
  return {
    id: "facture-test-1",
    createdAt: MAINTENANT,
    updatedAt: MAINTENANT,
    numero: "FAC-2026-0001",
    date: MAINTENANT,
    emplacementId: "depot-1",
    clientNom: "Client Test",
    clientTelephone: "077000001",
    clientAdresse: "Akanda",
    vendeurUtilisateurId: "u1",
    vendeurNomManuel: null,
    lignes: [
      {
        produitId: "p1",
        motif: "Marbre Blanc",
        reference: "REF-B-6060",
        taille: "60 × 60 cm",
        quantite: 5,
        // Mêmes valeurs que la capture d'écran : prix/carton 10 800 FCFA,
        // surface de carton 0.72 m² → prix/m² = 10800 / 0.72 = 15 000 FCFA.
        prixUnitaire: 10800,
        prixUnitaireNormal: null,
        promotionId: null,
        promotionLibelle: null,
        promotionType: null,
        promotionValeur: null,
        surfaceCartonM2: 0.72,
      },
    ],
    total: 54000,
    remise: 0,
    modeReglement: "Espèces",
    statutPaiement: "payee",
    montantPaye: 54000,
    statutLivraison: "en_attente",
    livreeLe: null,
    annuleeLe: null,
    annuleePar: null,
    motifAnnulation: null,
    corrigeeParFactureId: null,
    identiteSnapshot: null,
    ...overrides,
  };
}

function construireLigne(overrides: Partial<Facture["lignes"][number]> = {}): Facture["lignes"][number] {
  return {
    produitId: "p1",
    motif: "Marbre Blanc",
    reference: "REF-B-6060",
    taille: "60 × 60 cm",
    quantite: 5,
    prixUnitaire: 10800,
    prixUnitaireNormal: null,
    promotionId: null,
    promotionLibelle: null,
    promotionType: null,
    promotionValeur: null,
    surfaceCartonM2: 0.72,
    ...overrides,
  };
}

describe("genererFacturePdf — tableau, positions réelles du texte extraites du PDF généré", () => {
  it("PRIX/M² à 15 000 FCFA tient désormais sur UNE SEULE ligne (régression 2026-10-22)", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4", // ce test vérifie spécifiquement la géométrie du tableau A4 — jamais le format par défaut (A5 depuis la correction "choix du modèle d'impression", 2026-11-13).
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string; transform: number[] }[];

    // Rendu sur une seule ligne = UN SEUL item contenant la chaîne
    // complète (pdfkit n'émet jamais "15 000" et "FCFA" comme un seul
    // item s'il a dû les séparer sur deux lignes par manque de place).
    const itemPrixM2 = items.find((i) => i.str.trim() === "15 000 FCFA");
    expect(itemPrixM2, `"15 000 FCFA" devrait apparaître comme un seul segment de texte (preuve qu'il n'est plus coupé sur 2 lignes) — items trouvés : ${JSON.stringify(items.map((i) => i.str))}`).toBeDefined();

    // Jamais de fragment orphelin "15 000" ou "FCFA" seul à une AUTRE
    // position Y — signe d'un retour à la ligne resté non détecté.
    const fragmentsOrphelins = items.filter((i) => (i.str.trim() === "15 000" || i.str.trim() === "FCFA") && i !== itemPrixM2);
    expect(fragmentsOrphelins).toEqual([]);

    // Les colonnes voisines restent correctes (pas de régression du
    // repositionnement des colonnes suivantes après l'élargissement de
    // PRIX/M²).
    const texteComplet = items.map((i) => i.str).join(" ");
    expect(texteComplet).toContain("0.72");
    expect(texteComplet).toContain("10 800 FCFA");
    expect(texteComplet).toContain("RÉFÉRENCE");
    expect(texteComplet).toContain("PRIX/M²");
    expect(texteComplet).toContain("M²/CTN");
    expect(texteComplet).toContain("PRIX/CTN");
  });

  // Fondations quincaillerie (Phase 4) — adaptation de la facture A4 par unité de vente.
  it("facture exclusivement à la pièce : en-tête générique, désignation = nom réel du produit, caractéristiques affichées", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({
        lignes: [
          construireLigne({
            motif: "Robinet mitigeur",
            reference: "ROB-01",
            taille: "Standard",
            quantite: 3,
            prixUnitaire: 12000,
            surfaceCartonM2: null,
            uniteVente: "piece",
            caracteristiques: JSON.stringify([{ cle: "Couleur", valeur: "Chromé" }]),
          }),
        ],
        total: 36000,
      }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const texteComplet = (contenu.items as { str: string }[]).map((i) => i.str).join(" ");

    expect(texteComplet).toContain("Robinet"); // désignation = nom réel (éventuellement tronqué si trop long), jamais le mot générique "Cartons"
    expect(texteComplet).not.toContain("Cartons");
    expect(texteComplet).toContain("PRIX UNIT.");
    expect(texteComplet).not.toContain("PRIX/CTN");
    expect(texteComplet).not.toContain("PRIX/M²");
    expect(texteComplet).toContain("Pièce"); // libellé d'unité, capitalisé
    expect(texteComplet).toContain("Couleur"); // caractéristique affichée
  });

  it("facture mixte (carreau + sac) : en-tête générique, préserve le prix/m² du carreau, affiche les caractéristiques du sac", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({
        lignes: [
          construireLigne(), // carreau historique : 5 × 10 800, surfaceCartonM2: 0.72 → 15 000 FCFA/m²
          construireLigne({
            produitId: "p2",
            motif: "Ciment CPJ 45",
            reference: "CIM-50",
            taille: "Sac 50kg",
            quantite: 10,
            prixUnitaire: 6500,
            surfaceCartonM2: null,
            uniteVente: "sac",
            caracteristiques: JSON.stringify([{ cle: "Poids", valeur: "50 kg" }]),
          }),
        ],
        total: 10800 * 5 + 6500 * 10,
      }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const texteComplet = (contenu.items as { str: string }[]).map((i) => i.str).join(" ");

    expect(texteComplet).toContain("PRIX UNIT."); // facture mixte → en-tête générique, jamais "PRIX/CTN"
    expect(texteComplet).not.toContain("PRIX/CTN");
    expect(texteComplet).toContain("15 000"); // prix/m² du carreau préservé dans la case "Caractéristiques"
    expect(texteComplet).toContain("Ciment CPJ 45"); // désignation réelle du sac
    expect(texteComplet).toContain("Poids"); // caractéristique du sac affichée
    expect(texteComplet).toContain("Sac");
  });

  it("ancienne facture sans uniteVente ni surfaceCartonM2 enregistrés : traitée comme carton (comportement historique), jamais une exception", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({
        lignes: [construireLigne({ surfaceCartonM2: null, uniteVente: undefined, caracteristiques: undefined })],
      }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const texteComplet = (contenu.items as { str: string }[]).map((i) => i.str).join(" ");

    // Une seule ligne, sans unité enregistrée → uniteVenteEffective la
    // traite comme "carton" → en-tête HISTORIQUE conservé (PRIX/CTN),
    // DÉSIGNATION reste "Cartons" — comportement strictement historique.
    expect(texteComplet).toContain("PRIX/CTN");
    expect(texteComplet).toContain("Cartons");
    // Aucune surface connue pour cette ligne → "—" pour PRIX/M² et M²/CTN, jamais une valeur inventée.
    const itemsTirets = (contenu.items as { str: string }[]).filter((i) => i.str.trim() === "—");
    expect(itemsTirets.length).toBeGreaterThanOrEqual(2);
  });

  it("facture avec plusieurs lignes à unités différentes (sac, mètre, litre) : chacune affiche son propre libellé d'unité et ses propres caractéristiques", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({
        lignes: [
          construireLigne({ produitId: "p1", motif: "Ciment", reference: "CIM-50", taille: "Sac 50kg", quantite: 2, prixUnitaire: 6500, surfaceCartonM2: null, uniteVente: "sac" }),
          construireLigne({ produitId: "p2", motif: "Tuyau PVC", reference: "TUY-32", taille: "Ø32mm", quantite: 20, prixUnitaire: 1500, surfaceCartonM2: null, uniteVente: "metre" }),
          construireLigne({ produitId: "p3", motif: "Peinture blanche", reference: "PEI-10L", taille: "10L", quantite: 4, prixUnitaire: 15000, surfaceCartonM2: null, uniteVente: "litre" }),
        ],
        total: 6500 * 2 + 1500 * 20 + 15000 * 4,
      }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const texteComplet = (contenu.items as { str: string }[]).map((i) => i.str).join(" ");

    expect(texteComplet).toContain("Sac");
    expect(texteComplet).toContain("Mètre");
    expect(texteComplet).toContain("Litre");
    expect(texteComplet).toContain("Ciment");
    expect(texteComplet).toContain("Tuyau PVC");
    expect(texteComplet).toContain("Peinture"); // nom réel (éventuellement tronqué si trop long)
  });
});
