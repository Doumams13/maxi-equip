import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Pagination de la facture (0.12.6) — PDF réellement générés puis relus
 * par pdfjs-dist : aucune ligne perdue, aucun texte sous la ligne du pied
 * de page (748.4 pt depuis le haut), totaux une seule fois (dernière page).
 */
const DOSSIER = mkdtempSync(join(tmpdir(), "facture-pagination-"));
vi.mock("electron", () => ({ app: { getPath: () => DOSSIER } }));
const { genererFacturePdf, planifierPagesFacture, construireDocumentInterne, resoudreFormatFacture, PAGE_HEIGHT, PAGE_HEIGHT_A4_PAYSAGE } = await import("./factureDocumentService.js");
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const IDENTITE = { nom: "MAXI EQUIP", adresse: "Libreville", quartier: "", telephones: ["066338730"], nomAdministrateur: null, nomGerant: null };
const DATE = "2026-11-21T10:00:00.000Z";

function facture(nombreLignes: number, statutPaiement: "payee" | "reservation" = "payee"): Facture {
  const lignes = Array.from({ length: nombreLignes }, (_, i) => ({
    produitId: `p${i}`,
    motif: `Produit ${i}`,
    reference: `REF-${String(i + 1).padStart(3, "0")}`,
    taille: "60 × 60 cm",
    quantite: 2,
    prixUnitaire: 10000,
    prixUnitaireNormal: null,
    promotionId: null,
    promotionLibelle: null,
    promotionType: null,
    promotionValeur: null,
    surfaceCartonM2: 1.44,
    uniteVente: "carton" as const,
  }));
  return {
    id: "f",
    createdAt: DATE,
    updatedAt: DATE,
    numero: `FAC-PAG-${nombreLignes}`,
    date: DATE,
    emplacementId: "d1",
    clientNom: "Client",
    clientTelephone: null,
    clientAdresse: null,
    vendeurUtilisateurId: "u",
    vendeurNomManuel: null,
    lignes,
    total: nombreLignes * 20000,
    remise: 0,
    modeReglement: "Espèces",
    statutPaiement,
    montantPaye: statutPaiement === "reservation" ? 1000 : nombreLignes * 20000,
    statutLivraison: "en_attente",
    identiteSnapshot: null,
  } as unknown as Facture;
}

async function lire(chemin: string) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(readFileSync(chemin)) }).promise;
  const pages: { str: string; y: number }[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
    pages.push(items.map((i) => ({ str: i.str, y: i.transform[5]! })));
  }
  return pages;
}

describe("pagination de la facture", () => {
  it("plan : jusqu'à 13 articles = une page (facture payée), 12 pour une réservation ; au-delà, pages remplies au maximum et au moins 3 articles avec les totaux", () => {
    expect(planifierPagesFacture(facture(12))).toMatchObject({ hauteurLigne: 20, minimumLignes: 8 });
    expect(planifierPagesFacture(facture(13)).pages).toHaveLength(1);
    expect(planifierPagesFacture(facture(13, "reservation")).pages).toHaveLength(2);
    expect(planifierPagesFacture(facture(14)).pages.map((p) => p.length)).toEqual([11, 3]);
    expect(planifierPagesFacture(facture(18)).pages.map((p) => p.length)).toEqual([15, 3]);
    expect(planifierPagesFacture(facture(30)).pages.map((p) => p.length)).toEqual([19, 11]);
    const p40 = planifierPagesFacture(facture(40));
    expect(p40.pages.length).toBeGreaterThan(1);
    expect(p40.pages.flat()).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(p40.pages[p40.pages.length - 1]!.length).toBeGreaterThanOrEqual(3);
  });

  for (const n of [13, 16, 19, 40]) {
    for (const statut of ["payee", "reservation"] as const) {
      it(`A4, ${n} articles (${statut}) : toutes les références présentes, rien sous le pied de page, totaux une seule fois`, async () => {
        const chemin = await genererFacturePdf({ facture: facture(n, statut), identite: IDENTITE, vendeurNomAffiche: "MT", format: "a4" });
        if (process.env["APERCU_FACTURE"]) copyFileSync(chemin, join(process.env["APERCU_FACTURE"], `facture-${n}-${statut}.pdf`));
        const pages = await lire(chemin);
        const tout = pages.flat().map((i) => i.str).join(" ");
        for (let i = 1; i <= n; i++) expect(tout).toContain(`REF-${String(i).padStart(3, "0")}`);
        expect(pages.flat().filter((i) => i.str.includes("Total Net à payer") || i.str.includes("Solde restant")).length).toBe(1);
        // Contenu (hors pied de page) jamais sous la ligne du pied de page : y PDF natif > hauteur - 748.4.
        const motsDuPied = ["Société", "BP :", "RCCM", "E-mail", "Page "];
        for (const page of pages) {
          for (const item of page) {
            if (!item.str.trim() || motsDuPied.some((m) => item.str.includes(m))) continue;
            expect(item.y, `"${item.str}" déborde sur le pied de page`).toBeGreaterThan(PAGE_HEIGHT - 748.4);
          }
        }
        if (pages.length > 1) {
          expect(tout).toContain(`Page ${pages.length} / ${pages.length}`);
          expect(tout).toContain("Total à reporter");
          expect(tout).toContain("Report de la page précédente");
        }
      });
    }
  }

  it("A5 (2 par feuille) avec copie interne, 40 articles : une feuille par page de facture", async () => {
    const f = facture(40);
    const plan = planifierPagesFacture(f);
    const chemin = await genererFacturePdf({
      facture: f,
      identite: IDENTITE,
      vendeurNomAffiche: "MT",
      format: "a4-paysage",
      copieInterne: construireDocumentInterne(
        f,
        f.lignes.map((l) => ({ motif: l.motif, taille: l.taille, reference: l.reference, emplacementNom: "Akanda", quantite: l.quantite })),
        [],
        ["Akanda", "Akébé"],
        () => true
      ),
    });
    if (process.env["APERCU_FACTURE"]) copyFileSync(chemin, join(process.env["APERCU_FACTURE"], "facture-40-a5.pdf"));
    const pages = await lire(chemin);
    expect(pages.length).toBe(plan.pages.length);
    expect(PAGE_HEIGHT_A4_PAYSAGE).toBeLessThan(PAGE_HEIGHT);
    const tout = pages.flat().map((i) => i.str).join(" ");
    for (let i = 1; i <= 40; i++) expect(tout.split(`REF-${String(i).padStart(3, "0")}`).length - 1).toBeGreaterThanOrEqual(2);
    expect(tout).toContain("DOCUMENT INTERNE");
    expect(tout).toContain("MARGE SUR ACHAT");
  });

  it("format automatique : A5 jusqu'à 12 articles, A4 au-delà ; A4 automatique = facture puis document interne dans le même fichier", async () => {
    expect(resoudreFormatFacture(undefined, 13)).toBe("a4-paysage");
    expect(resoudreFormatFacture("auto", 14)).toBe("a4");
    expect(resoudreFormatFacture("a4-paysage", 30)).toBe("a4-paysage");
    expect(resoudreFormatFacture("a4", 3)).toBe("a4");
    const f = facture(18);
    const chemin = await genererFacturePdf({
      facture: f,
      identite: IDENTITE,
      vendeurNomAffiche: "MT",
      format: "auto",
      copieInterne: construireDocumentInterne(f, [], [], ["Akanda", "Akébé"], () => true),
    });
    const pages = await lire(chemin);
    const plan = planifierPagesFacture(f);
    expect(pages.length).toBe(plan.pages.length * 2);
    const texte = (i: number) => pages[i]!.map((x) => x.str).join(" ");
    for (let i = 0; i < plan.pages.length; i++) expect(texte(i)).toContain("FACTURE");
    for (let i = plan.pages.length; i < pages.length; i++) expect(texte(i)).toContain("DOCUMENT INTERNE");
  });
});
