import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Vérification RÉELLE du PDF généré (2026-10-21) — pas une relecture du
 * code : le fichier est réellement produit par pdfkit puis relu par
 * pdfjs-dist (déjà une dépendance du projet, utilisé par
 * PdfPreviewModal.tsx côté Renderer) pour extraire les positions RÉELLES
 * du texte sur la page. Un simple calcul manuel des coordonnées Y a déjà
 * fait manquer un chevauchement réel une première fois sur ce même
 * fichier (le contenu démarrait trop haut, par-dessus la dernière ligne
 * du bloc légal de l'en-tête) — seule une lecture du PDF réellement
 * généré peut le garantir.
 *
 * `electron` est mocké (seul `app.getPath` est utilisé par
 * bilanDocumentService.ts, jamais autre chose) : ce test tourne en Node
 * pur, jamais dans un vrai runtime Electron.
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "bilan-pdf-test-"));

vi.mock("electron", () => ({
  app: { getPath: () => DOSSIER_TEMP },
}));

const { genererBilanPdf } = await import("./bilanDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const IDENTITE_TEST = {
  nom: "MAXI EQUIP",
  adresse: "Libreville",
  quartier: "",
  telephones: ["077000000"],
  nomAdministrateur: null,
  nomGerant: null,
};

describe("genererBilanPdf — positions réelles du texte extraites du PDF généré", () => {
  it("avec le contenu le plus long possible (10 produits, 2 dépôts), toutes les sections apparaissent dans l'ordre, sans chevaucher l'en-tête ni déborder sous le pied de page", async () => {
    const chemin = await genererBilanPdf({
      identite: IDENTITE_TEST,
      periodeLibelle: "du 01/10/2026 au 21/10/2026",
      ventes: { caTotal: 1234567, nombreFactures: 12, remiseTotale: 10000 },
      topProduits: Array.from({ length: 10 }, (_, i) => ({ label: `REF-${i}`, quantite: 100 - i })),
      mouvements: { totalEntrees: 500, totalSorties: 300 },
      stockParEmplacement: [
        { nom: "Akébé", cartons: 100 },
        { nom: "Akanda", cartons: 50 },
      ],
      produitsSousSeuilCount: 3,
      promotionsActivesPendantPeriode: 2,
      depots: [],
      detailProduits: [],
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string; transform: number[] }[];

    // transform[5] = position Y en coordonnées NATIVES du PDF (origine en
    // bas à gauche, Y croissant vers le HAUT) — l'inverse des coordonnées
    // utilisées dans bilanDocumentService.ts (PDFKit : origine en haut,
    // Y croissant vers le bas). Une Y native PLUS GRANDE = plus haut sur
    // la page.
    function yDe(texteRecherche: string): number {
      const item = items.find((i) => i.str.includes(texteRecherche));
      expect(item, `texte "${texteRecherche}" introuvable dans le PDF généré`).toBeDefined();
      return item!.transform[5]!;
    }

    const yBlocLegalEnTete = yDe("SARLU au Capital Social");
    const yVentes = yDe("VENTES");
    const yMouvements = yDe("MOUVEMENTS DE STOCK");
    const yStock = yDe("STOCK ACTUEL");
    const yPromotions = yDe("PROMOTIONS");
    const yDernierProduit = yDe("REF-9");
    const yPiedDePage = yDe("Siège Social");

    // RÉGRESSION bug réel (2026-10-21) : le contenu démarrait assez haut
    // pour chevaucher visuellement la dernière ligne du bloc légal de
    // l'en-tête — jamais détecté par la seule lecture du code, uniquement
    // en relisant les positions réelles ci-dessus. Marge de 10pt pour
    // couvrir la hauteur de ligne, pas juste la ligne de base.
    expect(yVentes).toBeLessThan(yBlocLegalEnTete - 10);

    // Les sections apparaissent dans l'ordre attendu, strictement de haut
    // en bas (Y natif strictement décroissant) — jamais redessinées au
    // même endroit par une boucle buguée.
    expect(yVentes).toBeGreaterThan(yMouvements);
    expect(yMouvements).toBeGreaterThan(yStock);
    expect(yStock).toBeGreaterThan(yPromotions);

    // Même avec le contenu le plus long (10 produits), rien ne déborde
    // sous le pied de page.
    expect(yDernierProduit).toBeGreaterThan(yPiedDePage + 10);
  });

  it("avec un contenu minimal (aucune vente, aucun dépôt), ne plante jamais et affiche le message explicite", async () => {
    const chemin = await genererBilanPdf({
      identite: IDENTITE_TEST,
      periodeLibelle: "du 01/10/2026 au 21/10/2026",
      ventes: { caTotal: 0, nombreFactures: 0, remiseTotale: 0 },
      topProduits: [],
      mouvements: { totalEntrees: 0, totalSorties: 0 },
      stockParEmplacement: [],
      produitsSousSeuilCount: 0,
      promotionsActivesPendantPeriode: 0,
      depots: [],
      detailProduits: [],
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const texteComplet = (contenu.items as { str: string }[]).map((i) => i.str).join(" ");
    expect(texteComplet).toContain("Aucune vente enregistrée sur cette période");
  });

  it("tableau détaillé par produit : aucun produit → affiche le message explicite, pas de ligne vide", async () => {
    const chemin = await genererBilanPdf({
      identite: IDENTITE_TEST,
      periodeLibelle: "du 01/10/2026 au 21/10/2026",
      ventes: { caTotal: 0, nombreFactures: 0, remiseTotale: 0 },
      topProduits: [],
      mouvements: { totalEntrees: 0, totalSorties: 0 },
      stockParEmplacement: [],
      produitsSousSeuilCount: 0,
      promotionsActivesPendantPeriode: 0,
      depots: [{ id: "d1", nom: "Akébé" }],
      detailProduits: [],
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const texteComplet = (contenu.items as { str: string }[]).map((i) => i.str).join(" ");
    expect(texteComplet).toContain("DÉTAIL PAR PRODUIT");
    expect(texteComplet).toContain("Stock Akébé");
    expect(texteComplet).toContain("Aucun produit au catalogue.");
  });

  it("tableau détaillé par produit : un grand catalogue (60 produits) s'étale sur PLUSIEURS pages réelles, avec le pied de page sur chaque page, l'en-tête 'suite' sur les pages suivantes, et AUCUNE référence perdue ni dupliquée", async () => {
    const depots = [
      { id: "d1", nom: "Akébé" },
      { id: "d2", nom: "Akanda" },
    ];
    const detailProduits = Array.from({ length: 60 }, (_, i) => ({
      produitId: `p${i}`,
      motif: `Motif ${i}`,
      taille: "60x60",
      reference: `DET-${i}`,
      stockParEmplacement: [
        { emplacementId: "d1", cartons: i },
        { emplacementId: "d2", cartons: i * 2 },
      ],
      vendu: i,
      sortie: i % 3,
    }));

    const chemin = await genererBilanPdf({
      identite: IDENTITE_TEST,
      periodeLibelle: "du 01/10/2026 au 21/10/2026",
      ventes: { caTotal: 0, nombreFactures: 0, remiseTotale: 0 },
      topProduits: [],
      mouvements: { totalEntrees: 0, totalSorties: 0 },
      stockParEmplacement: [],
      produitsSousSeuilCount: 0,
      promotionsActivesPendantPeriode: 0,
      depots,
      detailProduits,
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    // Preuve réelle de la pagination — jamais un calcul manuel, voir
    // l'en-tête de ce fichier : 60 lignes ne peuvent tenir sous
    // LIMITE_BAS_CONTENU sur une seule page.
    expect(doc.numPages).toBeGreaterThan(1);

    const referencesTrouvees: number[] = [];
    let piedsDePageTrouves = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const contenu = await page.getTextContent();
      const items = contenu.items as { str: string }[];
      const texteComplet = items.map((i) => i.str).join(" ");
      if (texteComplet.includes("Siège Social")) piedsDePageTrouves += 1;
      if (n > 1) expect(texteComplet).toContain("DÉTAIL PAR PRODUIT (suite)");
      for (const item of items) {
        const correspondance = /^DET-(\d+)$/.exec(item.str);
        if (correspondance) referencesTrouvees.push(Number(correspondance[1]));
      }
    }

    // Pied de page présent sur CHAQUE page, pas uniquement la dernière.
    expect(piedsDePageTrouves).toBe(doc.numPages);
    // Les 60 références apparaissent EXACTEMENT une fois chacune, dans
    // l'ordre d'origine — ni perte, ni doublon, ni réordonnancement.
    expect(referencesTrouvees).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });
});
