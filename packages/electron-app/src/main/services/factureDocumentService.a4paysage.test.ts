import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Format A4 paysage — DEUX EXEMPLAIRES COMPLETS de la facture A4
 * portrait officielle, réduits à l'échelle et placés côte à côte, avec
 * trait de découpe central (Phase 4, remplace l'ancien choix "A5
 * indépendant" — correction : chaque panneau est désormais une pure
 * transformation graphique de `dessinerFacture`, jamais une mise en
 * page différente, voir factureDocumentService.ts).
 * Même principe de vérification RÉELLE que les autres fichiers de ce
 * module : le PDF est réellement généré par pdfkit puis relu par
 * pdfjs-dist, jamais un calcul manuel de coordonnées.
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "facture-pdf-a4paysage-test-"));

vi.mock("electron", () => ({
  app: { getPath: () => DOSSIER_TEMP },
}));

const { genererFacturePdf, PAGE_WIDTH_A4_PAYSAGE, PAGE_HEIGHT_A4_PAYSAGE, PAGE_WIDTH_A5 } = await import("./factureDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const IDENTITE_TEST = {
  nom: "MAXI EQUIP",
  adresse: "Libreville",
  quartier: "",
  telephones: ["077000000"],
  nomAdministrateur: null,
  nomGerant: null,
};

const MAINTENANT = "2026-11-15T10:00:00.000Z";

function construireFacture(overrides: Partial<Facture> = {}): Facture {
  return {
    id: "facture-test-paysage",
    createdAt: MAINTENANT,
    updatedAt: MAINTENANT,
    numero: "FAC-2026-0200",
    date: MAINTENANT,
    emplacementId: "depot-1",
    clientNom: "Client Test Paysage",
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

describe("genererFacturePdf — format A4 paysage (positions réelles extraites du PDF généré)", () => {
  it("génère une page unique aux dimensions A4 PAYSAGE réelles (largeur > hauteur)", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4-paysage",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);

    expect(page.view[2]).toBeCloseTo(PAGE_WIDTH_A4_PAYSAGE, 0);
    expect(page.view[3]).toBeCloseTo(PAGE_HEIGHT_A4_PAYSAGE, 0);
    expect(page.view[2]).toBeGreaterThan(page.view[3]!); // paysage : largeur > hauteur
  });

  it("par défaut (aucun format précisé), génère un A4 paysage — nouvelle décision 'A4 paysage par défaut' (Phase 4)", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({ numero: "FAC-2026-0201" }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    expect(page.view[2]).toBeCloseTo(PAGE_WIDTH_A4_PAYSAGE, 0);
    expect(page.view[2]).toBeGreaterThan(page.view[3]!);
  });

  it("les deux exemplaires sont STRICTEMENT identiques — même contenu texte, dupliqué exactement deux fois", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({ numero: "FAC-2026-0202" }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4-paysage",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string; transform: number[] }[];

    // Chaque texte significatif du panneau doit apparaître EXACTEMENT deux
    // fois (une fois par exemplaire) — jamais une seule fois (panneau
    // manquant) ni trois fois ou plus (contenu dupliqué par erreur).
    for (const texte of ["FAC-2026-0202", "Client Test Paysage", "REF-B-6060", "Total Net"]) {
      const occurrences = items.filter((i) => i.str.includes(texte));
      expect(occurrences.length, `"${texte}" devrait apparaître exactement 2 fois (une par exemplaire), trouvé ${occurrences.length} fois`).toBe(2);
    }

    // Les deux occurrences de la référence doivent être à des abscisses
    // (X) nettement différentes — preuve que ce sont bien deux panneaux
    // distincts côte à côte, jamais le même texte dessiné deux fois au
    // même endroit.
    const occurrencesReference = items.filter((i) => i.str.includes("REF-B-6060"));
    const [x1, x2] = occurrencesReference.map((i) => i.transform[4]!);
    expect(Math.abs(x1! - x2!)).toBeGreaterThan(PAGE_WIDTH_A5 * 0.5);
  });

  it("un trait de découpe central (pointillé) sépare les deux panneaux", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({ numero: "FAC-2026-0203" }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4-paysage",
    });

    // Vérification structurelle via les opérateurs de dessin RÉELS du PDF
    // généré (pdf.js), jamais un calcul manuel reproduit séparément de
    // l'implémentation : au moins une opération de tracé en pointillés
    // (OPS.setDash) doit apparaître — c'est précisément celle utilisée
    // par `dessinerFactureA4Paysage` pour le trait de découpe (aucun
    // autre tracé de ce document n'utilise de pointillés).
    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const operateurs = await page.getOperatorList();
    const { OPS } = pdfjsLib;
    const nombreTraitsPointilles = operateurs.fnArray.filter((op: number) => op === OPS.setDash).length;
    expect(nombreTraitsPointilles).toBeGreaterThan(0);
  });

  it("une facture mixte (carreau + sac) affiche le même contenu, identique sur les deux exemplaires", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({
        numero: "FAC-2026-0204",
        lignes: [
          construireFacture().lignes[0]!,
          {
            produitId: "p2",
            motif: "Ciment CPJ 45",
            reference: "CIM-50",
            taille: "Sac 50kg",
            quantite: 10,
            prixUnitaire: 6500,
            prixUnitaireNormal: null,
            promotionId: null,
            promotionLibelle: null,
            promotionType: null,
            promotionValeur: null,
            surfaceCartonM2: null,
            uniteVente: "sac",
          },
        ],
        total: 10800 * 5 + 6500 * 10,
        montantPaye: 10800 * 5 + 6500 * 10,
      }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a4-paysage",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string }[];

    // Chaque panneau est désormais une réduction FIDÈLE de la facture A4
    // portrait complète : le nom du produit (DÉSIGNATION) doit donc bien
    // apparaître, exactement comme sur le format A4 — ce n'est plus un
    // panneau simplifié qui ne montrerait que référence + taille.
    for (const texte of ["Sacs", "CIM-50", "PRIX UNIT.", "Cartons", "REF-B-6060"]) {
      const occurrences = items.filter((i) => i.str.includes(texte));
      expect(occurrences.length, `"${texte}" devrait apparaître exactement 2 fois`).toBe(2);
    }
  });

  it("retour client (2026-11-24) : facture client à gauche, DOCUMENT INTERNE à droite (quantité interne par dépôt, référence pour les carreaux)", async () => {
    const { construireDocumentInterne } = await import("./factureDocumentService.js");
    const facture = construireFacture({ numero: "FAC-2026-0305" });
    const copieInterne = construireDocumentInterne(
      facture,
      [
        { motif: "Marbre Blanc", taille: "60 × 60 cm", reference: "REF-B-6060", emplacementNom: "Akanda", quantite: 3 },
        { motif: "Marbre Blanc", taille: "60 × 60 cm", reference: "REF-B-6060", emplacementNom: "Akébé", quantite: 2 },
      ],
      [],
      ["Akanda", "Akébé"],
      () => true
    );
    expect(copieInterne.lignes[0]).toMatchObject({ designation: "REF-B-6060", parDepot: [3, 2], externe: 0 });
    const chemin = await genererFacturePdf({ facture, identite: IDENTITE_TEST, vendeurNomAffiche: "Jean Dupont", format: "a4-paysage", copieInterne });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
    const milieu = PAGE_WIDTH_A4_PAYSAGE / 2;
    const gauche = (i: { transform: number[] }) => i.transform[4]! < milieu;

    const titreInterne = items.filter((i) => i.str.includes("DOCUMENT INTERNE"));
    expect(titreInterne.length).toBe(1);
    expect(gauche(titreInterne[0]!)).toBe(false);
    const titreFacture = items.filter((i) => i.str.trim() === "FACTURE");
    expect(titreFacture.length).toBe(1);
    expect(gauche(titreFacture[0]!)).toBe(true);
    // Sous-colonnes de dépôt et bloc de marge uniquement côté interne ; CGV uniquement côté client.
    for (const texte of ["QTÉ INTERNE", "AKANDA", "AKÉBÉ", "MARGE SUR ACHAT"]) {
      const trouves = items.filter((i) => i.str.includes(texte));
      expect(trouves.length, texte).toBe(1);
      expect(gauche(trouves[0]!), texte).toBe(false);
    }
    const cgv = items.filter((i) => i.str.includes("CONDITIONS GENERALES"));
    expect(cgv.length).toBe(1);
    expect(gauche(cgv[0]!)).toBe(true);
    expect(items.filter((i) => i.str.includes("REF-B-6060") && !gauche(i)).length).toBe(1);
    expect(items.some((i) => i.str.includes("ne pas remettre au client"))).toBe(true);
    expect(items.some((i) => i.str.includes("RÉPARTITION PAR DÉPÔT"))).toBe(false);
  });
});
