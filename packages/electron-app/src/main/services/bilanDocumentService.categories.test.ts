import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Bilan par catégorie (point 5, 2026-11-24) — PDF réellement généré puis
 * relu par pdfjs-dist : bloc "Ventes par catégorie", tableau détaillé
 * regroupé (bandeau + sous-total), colonnes Désignation / Conditionnement,
 * mention du filtre et remise "non ventilée" sous filtre.
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "bilan-categories-test-"));
vi.mock("electron", () => ({ app: { getPath: () => DOSSIER_TEMP } }));

const { genererBilanPdf } = await import("./bilanDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const IDENTITE_TEST = { nom: "MAXI EQUIP", adresse: "Libreville", quartier: "", telephones: ["077000000"], nomAdministrateur: null, nomGerant: null };
const DEPOTS = [
  { id: "d1", nom: "Akanda" },
  { id: "d2", nom: "Akébé" },
];

function produit(
  id: string,
  categorieNom: string,
  sousCategorieNom: string,
  designation: string,
  uniteVente: "carton" | "sac" | "piece",
  vendu: number,
  estCarreau: boolean,
  carreauxParCarton: number | null = null
) {
  return {
    produitId: id,
    taille: estCarreau ? "60 × 60" : "Sac 50 kg",
    reference: designation,
    designation,
    categorieNom,
    sousCategorieNom,
    estCarreau,
    uniteVente,
    carreauxParCarton,
    stockParEmplacement: [
      { emplacementId: "d1", cartons: 10 },
      { emplacementId: "d2", cartons: 5 },
    ],
    vendu,
    sortie: 1,
  };
}

async function texteDe(chemin: string): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(readFileSync(chemin)) }).promise;
  let texte = "";
  for (let p = 1; p <= doc.numPages; p++) texte += " " + ((await (await doc.getPage(p)).getTextContent()).items as { str: string }[]).map((i) => i.str).join(" ");
  return texte;
}

describe("genererBilanPdf — bilan par catégorie", () => {
  it("toutes catégories : ventes par catégorie, groupes avec sous-totaux, conditionnement adapté", async () => {
    const chemin = await genererBilanPdf({
      identite: IDENTITE_TEST,
      periodeLibelle: "du 01/11/2026 au 24/11/2026",
      filtre: null,
      ventes: { caTotal: 1_500_000, nombreFactures: 9, remiseTotale: 25_000 },
      ventesParCategorie: [
        { categorieNom: "Carrelage et revêtements", chiffreAffaires: 1_050_000, quantites: [{ unite: "carton", quantite: 80 }], part: 0.7 },
        { categorieNom: "Matériaux de construction", chiffreAffaires: 450_000, quantites: [{ unite: "sac", quantite: 100 }], part: 0.3 },
      ],
      topProduits: [{ label: "MB-6060", quantite: 40 }],
      mouvements: { entrees: [{ unite: "carton", quantite: 100 }], sorties: [{ unite: "carton", quantite: 80 }, { unite: "sac", quantite: 100 }] },
      stockParEmplacement: [
        { nom: "Akanda", parUnite: [{ unite: "carton", quantite: 30 }] },
        { nom: "Akébé", parUnite: [{ unite: "sac", quantite: 15 }] },
      ],
      produitsSousSeuilCount: 1,
      promotionsActivesPendantPeriode: 0,
      depots: DEPOTS,
      detailProduits: [
        produit("p1", "Carrelage et revêtements", "Carreaux", "MB-6060", "carton", 40, true, 4),
        produit("p2", "Carrelage et revêtements", "Carreaux", "GA-4040", "carton", 40, true, 6),
        produit("p3", "Matériaux de construction", "Ciment", "Ciment CPJ 45", "sac", 100, false),
      ],
    });
    if (process.env["APERCU_BILAN"]) copyFileSync(chemin, join(process.env["APERCU_BILAN"], "bilan-categories.pdf"));
    const texte = await texteDe(chemin);
    expect(texte).toContain("Toutes catégories");
    expect(texte).toContain("VENTES PAR CATÉGORIE");
    expect(texte).toContain("1 050 000 FCFA");
    expect(texte).toContain("70,0 %");
    expect(texte).toContain("Carrelage et revêtements › Carreaux");
    expect(texte).toContain("Matériaux de construction › Ciment");
    expect(texte).toContain("4 pcs/ctn");
    expect(texte).toContain("Ciment CPJ 45");
    expect(texte).toContain("Sous-total — vendu : 80 cartons");
    expect(texte).toContain("Sous-total — vendu : 100 sacs");
    expect(texte).not.toContain("Pièces/carton");
  });

  it("sous filtre : mention de la catégorie et remise non ventilée", async () => {
    const chemin = await genererBilanPdf({
      identite: IDENTITE_TEST,
      periodeLibelle: "du 01/11/2026 au 24/11/2026",
      filtre: "Matériaux de construction",
      ventes: { caTotal: 450_000, nombreFactures: 4, remiseTotale: null },
      ventesParCategorie: [{ categorieNom: "Matériaux de construction", chiffreAffaires: 450_000, quantites: [{ unite: "sac", quantite: 100 }], part: 1 }],
      topProduits: [],
      mouvements: { entrees: [], sorties: [] },
      stockParEmplacement: [],
      produitsSousSeuilCount: 0,
      promotionsActivesPendantPeriode: 0,
      depots: DEPOTS,
      detailProduits: [produit("p3", "Matériaux de construction", "Ciment", "Ciment CPJ 45", "sac", 100, false)],
    });
    const texte = await texteDe(chemin);
    expect(texte).toContain("Catégorie : Matériaux de construction");
    expect(texte).toContain("Non ventilées par catégorie");
  });
});
