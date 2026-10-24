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

describe("genererFacturePdf — tableau, positions réelles du texte extraites du PDF généré", () => {
  it("PRIX/M² à 15 000 FCFA tient désormais sur UNE SEULE ligne (régression 2026-10-22)", async () => {
    const chemin = await genererFacturePdf({
      facture: construireFacture(),
      identite: IDENTITE_TEST,
      vendeurNomAffiche: "Jean Dupont",
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
});
