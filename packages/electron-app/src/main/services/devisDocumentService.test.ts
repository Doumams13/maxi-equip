import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Devis proforma (point 6, 2026-11-24) — PDF réellement généré par pdfkit
 * puis relu par pdfjs-dist, avec les données du modèle fourni
 * ("Proforma_MAXI_EQUIP_Remises_5_10_Ciment_Sans_Remise") : les montants
 * et le total net estimatif doivent être exactement ceux du modèle.
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "devis-pdf-test-"));
vi.mock("electron", () => ({ app: { getPath: () => DOSSIER_TEMP } }));

const { genererDevisPdf } = await import("./devisDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
type Devis = import("../repositories/devisRepository.js").Devis;

const IDENTITE_TEST = { nom: "MAXI EQUIP", adresse: "Libreville", quartier: "", telephones: ["066338730"], nomAdministrateur: null, nomGerant: null };

type L = [string, string, number | null, number, number, number, string?];
// [espace, format, surface m², quantité, P.U., remise %, unité]
const LIGNES_MODELE: L[] = [
  ["Terrasse avant", "30 × 30", 13.78, 10, 8415, 5],
  ["Salon", "60 × 60", 45.704, 32, 12960, 5],
  ["Salle à manger", "60 × 60", 17, 12, 12960, 5],
  ["Cuisine - sol", "40 × 40", 12.6, 7, 12480, 10],
  ["Cuisine - murs hors décors", "30 × 60", 34.92, 20, 12600, 5],
  ["Cuisine - décors", "30 × 60 décor", null, 10, 6000, 5, "piece"],
  ["Terrasse arrière 1", "30 × 30", 18.842, 13, 8415, 5],
  ["Marches escaliers", "30 × 30", 4.14, 3, 8415, 5],
  ["Chambre extérieure", "40 × 40", 10.8, 6, 12480, 10],
  ["Douche extérieure - sol", "40 × 40", 4.05, 3, 12480, 10],
  ["Douche extérieure - murs", "20 × 30", 21.42, 15, 6750, 5],
  ["WC visiteur - murs", "20 × 30", 15.096, 11, 6750, 5],
  ["Couloir visiteur", "60 × 60", 1.76, 2, 12960, 5],
  ["Chambre parents", "60 × 60", 21.4, 15, 12960, 5],
  ["Couloir parents", "60 × 60", 3.528, 3, 12960, 5],
  ["Douche parents - murs hors décors", "30 × 60", 22.272, 13, 12600, 5],
  ["Douche parents - décors", "30 × 60 décor", null, 10, 6000, 5, "piece"],
  ["Chambre enfants 1", "40 × 40", 10.092, 6, 12480, 10],
  ["Chambre enfants 2", "40 × 40", 12.096, 7, 12480, 10],
  ["Douche WC enfants - murs", "20 × 30", 27.948, 19, 6750, 5],
  ["Couloir enfants", "40 × 40", 1.68, 1, 12480, 10],
  ["Marches chambres enfants", "30 × 30", 1.68, 2, 8415, 5],
  ["Terrasse arrière 2", "30 × 30", 7.1, 5, 8415, 5],
  ["Marches escaliers arrière", "30 × 30", 1.68, 2, 8415, 5],
  ["Ciment-colle 20 kg - ensemble du chantier", "ciment", 313.188, 105, 4500, 0, "sac"],
];

function devisModele(): Devis {
  return {
    id: "dv1",
    numero: "DEV-2026-0001",
    date: "2026-11-23T10:00:00.000Z",
    clientNom: "",
    clientTelephone: null,
    clientAdresse: null,
    modeReglement: null,
    objet: "Fourniture de carrelage sols, murs et décors",
    notes: "Prix : barème Maxi-Equip joint.\nRemises appliquées : 10 % uniquement sur les 40 × 40 ; 5 % sur les autres carreaux ; aucune remise sur le ciment-colle.",
    total: 0,
    remise: 0,
    remiseGlobale: 0,
    statut: "brouillon",
    factureId: null,
    utilisateurId: null,
    createdAt: "2026-11-23T10:00:00.000Z",
    updatedAt: "2026-11-23T10:00:00.000Z",
    lignes: LIGNES_MODELE.map(([espace, taille, surface, quantite, prix, remise, unite]) => ({
      produitId: null,
      motif: espace,
      reference: unite ? null : `REF-${taille.replace(/\D/g, "")}`,
      taille,
      quantite,
      prixUnitaire: prix,
      espace,
      surfaceM2: surface,
      remisePourcent: remise,
      uniteVente: unite ?? "carton",
      surfaceCartonM2: null,
    })),
  };
}

describe("genererDevisPdf — FACTURE PROFORMA (modèle fourni)", () => {
  it("reproduit les montants du modèle, paginé, avec récapitulatif par format et total net estimatif", async () => {
    const chemin = await genererDevisPdf({ devis: devisModele(), identite: IDENTITE_TEST, vendeurNomAffiche: "Jean Dupont" });
    if (process.env["APERCU_DEVIS"]) copyFileSync(chemin, join(process.env["APERCU_DEVIS"], "proforma-apercu.pdf"));

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(readFileSync(chemin)) }).promise;
    expect(doc.numPages).toBeGreaterThanOrEqual(2);
    let texte = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const contenu = await (await doc.getPage(p)).getTextContent();
      texte += " " + (contenu.items as { str: string }[]).map((i) => i.str).join(" ");
    }
    expect(texte).toContain("FACTURE PROFORMA");
    expect(texte).toContain("DEV-2026-0001");
    expect(texte).toContain("RÉCAPITULATIF PAR FORMAT");
    expect(texte).toContain("DÉSIGNATION / RÉFÉRENCE");
    expect(texte).not.toContain("ESPACE / APPLICATION");
    expect(texte).toContain("REF-3030 · Terrasse avant"); // référence pour un carreau, espace en complément
    // Lignes du modèle : net et remise identiques au document fourni
    for (const attendu of ["79 942", "393 984", "4 208", "472 500", "121 837"]) expect(texte).toContain(attendu);
    // Récapitulatif par format du modèle
    for (const attendu of ["787 968", "336 960", "279 797", "288 561", "395 010", "114 000"]) expect(texte).toContain(attendu);
    expect(texte).toContain("TOTAL NET ESTIMATIF : 2 674 796 FCFA");
    expect(texte).toContain("2 810 415");
    expect(texte).toContain("135 619");
    expect(texte).toContain("HYPOTHÈSES DE CALCUL");
    expect(texte).toContain("ni une commande ferme");
    expect(texte).toContain(`Page 1 / ${doc.numPages}`);
  });
});
