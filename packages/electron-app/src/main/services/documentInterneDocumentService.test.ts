import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Correction "facture détaillée pour le dépôt" (2026-11-13) — même
 * principe de vérification RÉELLE que bilanDocumentService.test.ts /
 * factureDocumentService.visuel.test.ts : le PDF est réellement généré
 * par pdfkit puis relu par pdfjs-dist, jamais une relecture du code.
 * Vérifie que la nouvelle section "RÉPARTITION PAR DÉPÔT" apparaît
 * indépendamment de la section "achat extérieur" existante — l'une peut
 * exister sans l'autre (décision : ce document sert désormais aux deux
 * cas, voir FacturesScreen.tsx `aRepartitionDepot`).
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "document-interne-pdf-test-"));

vi.mock("electron", () => ({
  app: { getPath: () => DOSSIER_TEMP },
}));

const { genererDocumentInternePdf } = await import("./documentInterneDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const IDENTITE_TEST = {
  nom: "MAXI EQUIP",
  adresse: "Libreville",
  quartier: "",
  telephones: ["077000000"],
  nomAdministrateur: null,
  nomGerant: null,
};

const MAINTENANT = "2026-11-13T10:00:00.000Z";

function construireFacture(overrides: Partial<Facture> = {}): Facture {
  return {
    id: "facture-test-1",
    createdAt: MAINTENANT,
    updatedAt: MAINTENANT,
    numero: "FAC-2026-0099",
    date: MAINTENANT,
    emplacementId: "shop-1",
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
        quantite: 10,
        prixUnitaire: 10800,
        prixUnitaireNormal: null,
        promotionId: null,
        promotionLibelle: null,
        promotionType: null,
        promotionValeur: null,
        surfaceCartonM2: 0.72,
      },
    ],
    total: 108000,
    remise: 0,
    modeReglement: "Espèces",
    statutPaiement: "payee",
    montantPaye: 108000,
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

async function texteDuPdf(chemin: string): Promise<string> {
  const data = new Uint8Array(readFileSync(chemin));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const contenu = await page.getTextContent();
  return (contenu.items as { str: string }[]).map((i) => i.str).join(" ");
}

describe("genererDocumentInternePdf — répartition par dépôt (positions réelles extraites du PDF généré)", () => {
  it("vente 100% dépôt (aucun achat extérieur) : affiche UNIQUEMENT la répartition par dépôt, jamais le tableau achat extérieur", async () => {
    const chemin = await genererDocumentInternePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      lignes: [],
      repartitionDepots: [{ motif: "Marbre Blanc", taille: "60 × 60 cm", emplacementNom: "Akébé", quantite: 10 }],
    });

    const texte = await texteDuPdf(chemin);
    expect(texte).toContain("RÉPARTITION PAR DÉPÔT");
    expect(texte).toContain("Akébé");
    expect(texte).not.toContain("MARGE SUR ACHAT EXTÉRIEUR");
  });

  it("vente 100% achat extérieur (aucune répartition dépôt) : affiche UNIQUEMENT le tableau achat extérieur, jamais la section dépôt", async () => {
    const chemin = await genererDocumentInternePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      lignes: [{ motif: "Marbre Blanc", taille: "60 × 60 cm", quantiteTotale: 10, quantiteInterne: 0, quantiteExterne: 10, fournisseur: "Fournisseur X", prixAchat: 8000 }],
      repartitionDepots: [],
    });

    const texte = await texteDuPdf(chemin);
    expect(texte).toContain("MARGE SUR ACHAT EXTÉRIEUR");
    expect(texte).not.toContain("RÉPARTITION PAR DÉPÔT");
  });

  it("vente MIXTE (une partie dépôt, une partie achat extérieur) : les deux sections apparaissent, achat extérieur avant répartition par dépôt", async () => {
    const chemin = await genererDocumentInternePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      lignes: [{ motif: "Marbre Blanc", taille: "60 × 60 cm", quantiteTotale: 10, quantiteInterne: 6, quantiteExterne: 4, fournisseur: "Fournisseur X", prixAchat: 8000 }],
      repartitionDepots: [
        { motif: "Marbre Blanc", taille: "60 × 60 cm", emplacementNom: "Akébé", quantite: 4 },
        { motif: "Marbre Blanc", taille: "60 × 60 cm", emplacementNom: "Akanda", quantite: 2 },
      ],
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string; transform: number[] }[];
    const texte = items.map((i) => i.str).join(" ");

    expect(texte).toContain("MARGE SUR ACHAT EXTÉRIEUR");
    expect(texte).toContain("RÉPARTITION PAR DÉPÔT");
    expect(texte).toContain("Akébé");
    expect(texte).toContain("Akanda");

    function yDe(texteRecherche: string): number {
      const item = items.find((i) => i.str.includes(texteRecherche));
      expect(item, `texte "${texteRecherche}" introuvable`).toBeDefined();
      return item!.transform[5]!;
    }
    // Y natif décroissant du haut vers le bas de la page — "achat
    // extérieur" doit apparaître AU-DESSUS de "répartition par dépôt".
    expect(yDe("MARGE SUR ACHAT EXTÉRIEUR")).toBeGreaterThan(yDe("RÉPARTITION PAR DÉPÔT"));
  });
});
