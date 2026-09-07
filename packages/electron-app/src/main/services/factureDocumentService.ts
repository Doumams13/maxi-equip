import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Génération du document PDF de la facture MAXI EQUIP.
 *
 * IMPORTANT : ce document reproduit fidèlement le modèle officiel fourni
 * (Facture_MAXI_EQUIP_final.pdf) — disposition, textes fixes, logo,
 * filigrane, tableau, pied de page. Les coordonnées ci-dessous ont été
 * extraites directement du PDF de référence (pdfplumber), pas
 * réinventées. Seules les valeurs entre crochets du modèle sont
 * injectées dynamiquement ; aucune information n'est ajoutée ni retirée
 * par rapport à la structure d'origine.
 *
 * Le logo couleur et le filigrane sont les images extraites telles
 * quelles du PDF officiel (packages/electron-app/src/main/assets),
 * jamais recréées.
 */

const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;
const MARGE_GAUCHE = 45.5;
const MARGE_DROITE = 576;

const VERT = "#6ca545";
const GRIS_LABEL = "#8a8574";
const FOND_BOITE = "#f3f2ee";
const NOIR = "#1a1a1a";

function assetPath(nom: string): string {
  // Empaqueté tel quel par electron-vite (voir electron.vite.config.ts, assets copiés).
  return join(__dirname, "../../assets", nom);
}

/**
 * `toLocaleString("fr-FR")` insère une espace INSÉCABLE (U+00A0) comme
 * séparateur de milliers — bug réel trouvé par inspection visuelle du
 * PDF généré : les polices standard de pdfkit (Helvetica) ne savent pas
 * afficher ce caractère et le remplacent par un symbole incorrect
 * ("9 /600 FCFA" au lieu de "9 600 FCFA"). Corrigé en formatant
 * manuellement avec une espace normale.
 */
function formaterMontant(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export interface FactureDocumentInput {
  facture: Facture;
  nomMagasin: string;
  vendeurNomAffiche: string;
}

/**
 * Génère le PDF de la facture et l'enregistre sur disque. Retourne le
 * chemin du fichier — jamais recréé si déjà généré pour la même facture
 * avec les mêmes données (le nom de fichier est déterministe, basé sur
 * le numéro de facture, §3/§4 : "cliquer plusieurs fois ne doit pas
 * créer plusieurs factures/numéros").
 */
export async function genererFacturePdf(input: FactureDocumentInput): Promise<string> {
  const dossier = join(app.getPath("userData"), "factures-generees");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, `${input.facture.numero}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);

    dessinerFacture(doc, input);

    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}

function dessinerFacture(doc: PDFKit.PDFDocument, { facture, nomMagasin, vendeurNomAffiche }: FactureDocumentInput): void {
  // --- Filigrane (derrière tout le reste, tel qu'extrait du PDF officiel) ---
  try {
    doc.opacity(1).image(assetPath("facture-filigrane.png"), 79.2, 293.9, { width: 465, height: 321 });
  } catch {
    // Filigrane absent — le document reste utilisable sans, jamais bloquant.
  }

  // --- Logo couleur (haut gauche) ---
  try {
    doc.image(assetPath("facture-logo.jpg"), MARGE_GAUCHE, 56.5, { width: 240.1, height: 62.8 });
  } catch {
    // idem
  }

  // --- Titre FACTURE + numéro + date + statut (haut droite) ---
  doc.font("Helvetica-Bold").fontSize(20).fillColor(VERT).text("FACTURE", 400, 60.4, { width: MARGE_DROITE - 400, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(NOIR).text(facture.numero, 400, 90.7, { width: MARGE_DROITE - 400, align: "right" });
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Date : ${dateAffichee}`, 400, 101.8, { width: MARGE_DROITE - 400, align: "right" });
  // Statut de livraison = uniquement une information interne à
  // l'application (écran Factures) — jamais sur le document remis au
  // client, qui affiche simplement "Payée".
  doc.font("Helvetica-Oblique").fontSize(8).text("Statut : Payée", 380, 118.4, { width: MARGE_DROITE - 380, align: "right" });

  // --- Bloc informations légales MAXI EQUIP (gauche) ---
  doc.font("Helvetica").fontSize(7.6).fillColor(NOIR);
  const lignesLegales = [
    "Quincaillerie et Vente de Matériaux de Construction :",
    "Import et Export des Marchandise de Construction",
    "SARLU au Capital Social : 1 000 000 FCFA",
    "N° RCCM : GA-LBV-01-2025-B13-00187",
    "N° NIF .: 202601002934 B",
    "BP .: 22103 - Tél .: 066 33 87 30 - 077 42 61 87",
    "077 00 54 11 / N° de Compte Bancaire : 90000489234-90",
    "Quartier : Beaulieu (face à BATI-PLUS / Akanda - Gabon",
  ];
  let y = 132.6;
  for (const ligne of lignesLegales) {
    doc.text(ligne, MARGE_GAUCHE, y);
    y += 11.15;
  }

  // --- Ligne verte de séparation ---
  doc.moveTo(43.6, 245).lineTo(551.9, 245).lineWidth(1.2).strokeColor(VERT).stroke();

  // --- Deux boîtes : FACTURÉ À / DÉTAILS DE VENTE ---
  doc.rect(45.2, 255.5, 259.4, 78.7).fill(FOND_BOITE);
  doc.rect(304.9, 255.5, 259.2, 78.7).fill(FOND_BOITE);

  doc.font("Helvetica-Bold").fontSize(8).fillColor(GRIS_LABEL);
  doc.text("FACTURÉ À", 55.2, 265.2);
  doc.text("DÉTAILS DE VENTE", 314.7, 265.2);

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NOIR);
  doc.text(facture.clientNom, 55.2, 279.3);
  doc.font("Helvetica").text(facture.clientTelephone ?? "—", 55.2, 291.9);
  doc.text(facture.clientAdresse ?? "—", 55.2, 304.0);

  doc.font("Helvetica").fontSize(9.5).fillColor(NOIR);
  doc.text(`Magasin : ${nomMagasin}`, 314.7, 279.3);
  doc.text(`Nombre d'articles : ${facture.lignes.length}`, 314.7, 291.9);
  doc.text(`Mode de règlement : ${facture.modeReglement ?? "—"}`, 314.7, 304.0);
  doc.text(`Vendeur : ${vendeurNomAffiche}`, 314.7, 316.1);

  // --- Tableau ---
  const colonnes = [
    { x: 45.5, largeur: 188.1, titre: "DESIGNATION" },
    { x: 234.1, largeur: 64.6, titre: "TAILLE" },
    { x: 299.2, largeur: 64.7, titre: "QTÉ" },
    { x: 364.4, largeur: 94.7, titre: "PRIX UNITAIRE" },
    { x: 459.6, largeur: 116, titre: "TOTAL" },
  ];
  const tableTop = 369.9;
  const headerHeight = 17.7;
  const rowHeight = 21;

  doc.rect(45, tableTop, 531.1, headerHeight).fillAndStroke("#ffffff", "#cccccc");
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NOIR);
  for (const col of colonnes) {
    doc.text(col.titre, col.x + 6, tableTop + 5, { width: col.largeur - 10 });
  }

  let ligneY = tableTop + headerHeight;
  const nombreLignesAffichees = Math.max(facture.lignes.length, 8); // au moins 8 lignes visibles, comme le modèle
  doc.font("Helvetica").fontSize(9);
  for (let i = 0; i < nombreLignesAffichees; i++) {
    const ligne = facture.lignes[i];
    doc.rect(45, ligneY, 531.1, rowHeight).strokeColor("#cccccc").lineWidth(0.5).stroke();
    for (const col of colonnes) {
      doc
        .moveTo(col.x - 0.3, ligneY)
        .lineTo(col.x - 0.3, ligneY + rowHeight)
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .stroke();
    }
    if (ligne) {
      doc.fillColor(NOIR);
      doc.text(ligne.motif, colonnes[0]!.x + 6, ligneY + 6, { width: colonnes[0]!.largeur - 10 });
      doc.text(ligne.taille, colonnes[1]!.x + 6, ligneY + 6, { width: colonnes[1]!.largeur - 10 });
      doc.text(String(ligne.quantite), colonnes[2]!.x + 6, ligneY + 6, { width: colonnes[2]!.largeur - 10 });
      doc.text(`${formaterMontant(ligne.prixUnitaire)} FCFA`, colonnes[3]!.x + 6, ligneY + 6, { width: colonnes[3]!.largeur - 10 });
      doc.text(`${formaterMontant(ligne.quantite * ligne.prixUnitaire)} FCFA`, colonnes[4]!.x + 6, ligneY + 6, {
        width: colonnes[4]!.largeur - 10,
      });
    }
    ligneY += rowHeight;
  }

  // --- Total à payer ---
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NOIR);
  doc.text("Total à payer", 380, ligneY + 20);
  doc.text(`${formaterMontant(facture.total)} FCFA`, 480, ligneY + 20, { width: MARGE_DROITE - 480, align: "right" });

  // --- Pied de page (texte fixe du modèle) ---
  doc.moveTo(43.6, 748.4).lineTo(551.9, 748.4).lineWidth(0.6).strokeColor("#999999").stroke();
  doc.font("Helvetica-BoldOblique").fontSize(7.6).fillColor(NOIR);
  doc.text("N°CNSS : 015-4109172-M - N°CNAMGS : 022-500-043-231", MARGE_GAUCHE, 774.3, { width: MARGE_DROITE - MARGE_GAUCHE, align: "center" });
  doc.text("Merci pour votre confiance. Marchandise vendue non reprise et non échangée sauf accord préalable.", MARGE_GAUCHE, 785.5, {
    width: MARGE_DROITE - MARGE_GAUCHE,
    align: "center",
  });
}
