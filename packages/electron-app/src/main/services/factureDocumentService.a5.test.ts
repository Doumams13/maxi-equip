import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Correction "choix du modèle d'impression — A5 par défaut" (2026-11-13).
 * Même principe de vérification RÉELLE que factureDocumentService.visuel.test.ts
 * (PDF réellement généré par pdfkit, relu par pdfjs-dist) — vérifie que le
 * format A5 produit une page de la bonne taille, avec tout son contenu
 * dans les limites de la page (jamais un calcul manuel de coordonnées).
 */
const DOSSIER_TEMP = mkdtempSync(join(tmpdir(), "facture-pdf-a5-test-"));

vi.mock("electron", () => ({
  app: { getPath: () => DOSSIER_TEMP },
}));

const { genererFacturePdf, PAGE_WIDTH_A5, PAGE_HEIGHT_A5 } = await import("./factureDocumentService.js");
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
    id: "facture-test-a5",
    createdAt: MAINTENANT,
    updatedAt: MAINTENANT,
    numero: "FAC-2026-0100",
    date: MAINTENANT,
    emplacementId: "depot-1",
    clientNom: "Client Test A5",
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

describe("genererFacturePdf — format A5 (positions réelles extraites du PDF généré)", () => {
  it("génère une page aux dimensions A5 réelles, avec tout le contenu dans les limites de la page", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a5",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);

    expect(page.view[2]).toBeCloseTo(PAGE_WIDTH_A5, 0);
    expect(page.view[3]).toBeCloseTo(PAGE_HEIGHT_A5, 0);

    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string; transform: number[] }[];
    const texteComplet = items.map((i) => i.str).join(" ");

    expect(texteComplet).toContain("FACTURE");
    expect(texteComplet).toContain(construireFacture().numero);
    expect(texteComplet).toContain("Client Test A5");
    expect(texteComplet).toContain("REF-B-6060");
    expect(texteComplet).toContain("Total Net");

    // Rien ne doit déborder sous le bas de page (hauteur réelle A5).
    for (const item of items) {
      expect(item.transform[5]!, `"${item.str}" déborde sous le bas de la page A5`).toBeGreaterThan(0);
    }
  });

  it("par défaut (aucun format précisé), génère un A5 — décision utilisateur 'A5 par défaut'", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({ numero: "FAC-2026-0101" }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    expect(page.view[2]).toBeCloseTo(PAGE_WIDTH_A5, 0);
  });

  it("une réservation (acompte + solde restant) s'affiche sans chevaucher le pied de page A5", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture({ numero: "FAC-2026-0102", statutPaiement: "reservation", montantPaye: 20000 }),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
      format: "a5",
    });

    const data = new Uint8Array(readFileSync(chemin));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const contenu = await page.getTextContent();
    const items = contenu.items as { str: string; transform: number[] }[];
    const texteComplet = items.map((i) => i.str).join(" ");

    expect(texteComplet).toContain("Acompte versé");
    expect(texteComplet).toContain("Solde restant");

    function yDe(texteRecherche: string): number {
      const item = items.find((i) => i.str.includes(texteRecherche));
      expect(item, `texte "${texteRecherche}" introuvable`).toBeDefined();
      return item!.transform[5]!;
    }
    expect(yDe("Solde restant")).toBeGreaterThan(yDe("Siège Social"));
  });
});
