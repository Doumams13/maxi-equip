import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Facture } from "@maxi-equip/shared-types";
import type { IdentiteEntreprise } from "../repositories/parametresRepository.js";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGE_DROITE,
  GRIS_LABEL,
  FOND_BOITE,
  NOIR,
  formaterMontant,
  dessinerEnTeteEtIdentite,
  dessinerPiedDePage,
} from "./factureDocumentService.js";

export interface LigneDocumentInterne {
  motif: string;
  taille: string;
  quantiteTotale: number;
  quantiteInterne: number;
  quantiteExterne: number;
  fournisseur: string | null;
  prixAchat: number | null;
}

export interface DocumentInterneInput {
  facture: Facture;
  identite: IdentiteEntreprise;
  vendeurNomAffiche: string;
  lignes: LigneDocumentInterne[];
}

/**
 * Document interne — RÉSERVÉ AUX ACHATS EXTÉRIEURS (correction "Document
 * interne — réservé aux achats extérieurs") : n'a de sens et n'est
 * proposé (voir FacturesScreen.tsx, condition `f.aAchatExterieur`) que
 * lorsqu'au moins une ligne de la vente a nécessité un complément
 * fournisseur externe. Ne montre donc plus que les lignes de provenance
 * EXTERNE (jamais la part MAXI EQUIP, qui n'a pas de "prix d'achat" à
 * documenter ici) — exactement ce que montre l'exemple du prompt : deux
 * lignes de fournisseurs différents, jamais de ligne "MAXI-EQUIP".
 *
 * Reprend l'identité visuelle de la facture officielle (logo, filigrane,
 * en-tête, bloc légal, style de tableau, pied de page — via les
 * fonctions partagées dessinerEnTeteEtIdentite/dessinerPiedDePage,
 * jamais un nouveau design inventé).
 *
 * LIMITE CONNUE, signalée pour transparence : le modèle de vente actuel
 * (VenteInput/venteService) ne permet qu'UN SEUL fournisseur externe par
 * ligne de produit. Le cas "plusieurs fournisseurs pour un même produit"
 * n'est donc pas représentable avec les données réellement enregistrées
 * aujourd'hui.
 */
export async function genererDocumentInternePdf(input: DocumentInterneInput): Promise<string> {
  const dossier = join(app.getPath("userData"), "documents-internes-generes");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, `${input.facture.numero}-document-interne.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);

    dessinerDocumentInterne(doc, input);

    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}

interface LigneAchatExterieur {
  motif: string;
  taille: string;
  quantite: number;
  provenance: string;
  prixUnitaire: number;
  total: number;
}

/**
 * Ne conserve QUE les lignes ayant réellement un complément externe
 * (quantiteExterne > 0) — la part MAXI EQUIP n'apparaît plus sur ce
 * document, désormais dédié exclusivement au suivi financier des achats
 * extérieurs (§1/§5 de la correction). Le prix unitaire et le total
 * viennent directement du relevé d'approvisionnement réellement
 * enregistré lors de la vente — jamais inventés (§9 : "vérifier toute la
 * chaîne").
 */
function extraireLignesAchatExterieur(lignes: LigneDocumentInterne[]): LigneAchatExterieur[] {
  return lignes
    .filter((l) => l.quantiteExterne > 0)
    .map((l) => ({
      motif: l.motif,
      taille: l.taille,
      quantite: l.quantiteExterne,
      provenance: l.fournisseur ?? "—",
      prixUnitaire: l.prixAchat ?? 0,
      total: l.quantiteExterne * (l.prixAchat ?? 0),
    }));
}

function dessinerDocumentInterne(doc: PDFKit.PDFDocument, { facture, identite, vendeurNomAffiche, lignes }: DocumentInterneInput): void {
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  dessinerEnTeteEtIdentite(doc, identite, {
    titre: "DOCUMENT INTERNE",
    // Indique clairement qu'il s'agit d'un achat extérieur (§6) — jamais
    // confondu avec la facture client dont il est issu.
    ligneReference: `Achat extérieur — Facture liée : ${facture.numero}`,
    dateAffichee,
  });

  // --- Deux boîtes : FACTURÉ À / DÉTAILS DE VENTE — mêmes libellés,
  // mêmes positions, même style que la facture. ---
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
  doc.text(`Magasin : ${identite.nom}`, 314.7, 279.3);
  doc.text(`Nombre d'articles : ${facture.lignes.length}`, 314.7, 291.9);
  doc.text(`Mode de règlement : ${facture.modeReglement ?? "—"}`, 314.7, 304.0);
  doc.text(`Vendeur : ${vendeurNomAffiche}`, 314.7, 316.1);

  // --- Tableau — même style visuel que la facture (bordures, en-tête,
  // hauteur de ligne). Colonnes (§3) : Désignation / Taille / Quantité /
  // Provenance / Prix unitaire / Total — les informations financières ne
  // remplacent jamais la provenance, les deux coexistent (§5). ---
  const colonnes = [
    { x: 45.5, largeur: 141.6, titre: "DÉSIGNATION" },
    { x: 187.1, largeur: 58.9, titre: "TAILLE" },
    { x: 246.0, largeur: 51.5, titre: "QUANTITÉ" },
    { x: 297.5, largeur: 98.1, titre: "PROVENANCE" },
    { x: 395.6, largeur: 82.5, titre: "PRIX UNITAIRE" },
    { x: 478.1, largeur: 98, titre: "TOTAL" },
  ];
  const tableTop = 369.9;
  const headerHeight = 17.7;
  const rowHeight = 21;

  doc.rect(45, tableTop, 531.1, headerHeight).fillAndStroke("#ffffff", "#cccccc");
  doc.font("Helvetica-Bold").fontSize(8).fillColor(NOIR);
  for (const col of colonnes) {
    doc.text(col.titre, col.x + 5, tableTop + 5.5, { width: col.largeur - 8 });
  }

  const lignesAchat = extraireLignesAchatExterieur(lignes);
  let ligneY = tableTop + headerHeight;
  const nombreLignesAffichees = Math.max(lignesAchat.length, 8); // au moins 8 lignes visibles, comme le modèle de facture
  doc.font("Helvetica").fontSize(9);
  for (let i = 0; i < nombreLignesAffichees; i++) {
    const ligne = lignesAchat[i];
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
      doc.fillColor(NOIR).font("Helvetica").fontSize(8.5);
      doc.text(ligne.motif, colonnes[0]!.x + 5, ligneY + 6, { width: colonnes[0]!.largeur - 8 });
      doc.text(ligne.taille, colonnes[1]!.x + 5, ligneY + 6, { width: colonnes[1]!.largeur - 8 });
      doc.text(String(ligne.quantite), colonnes[2]!.x + 5, ligneY + 6, { width: colonnes[2]!.largeur - 8 });
      // La provenance externe reste mise en évidence (couleur d'accent) —
      // jamais visible sur la facture client.
      doc.fillColor("#b8860b");
      doc.text(ligne.provenance, colonnes[3]!.x + 5, ligneY + 6, { width: colonnes[3]!.largeur - 8 });
      doc.fillColor(NOIR);
      doc.text(`${formaterMontant(ligne.prixUnitaire)} FCFA`, colonnes[4]!.x + 5, ligneY + 6, { width: colonnes[4]!.largeur - 8 });
      doc.text(`${formaterMontant(ligne.total)} FCFA`, colonnes[5]!.x + 5, ligneY + 6, { width: colonnes[5]!.largeur - 8 });
    }
    ligneY += rowHeight;
  }

  // --- TOTAL GÉNÉRAL — même présentation visuelle que "Total à payer"
  // de la facture. Somme réelle des totaux de ligne, jamais un calcul
  // inventé (§3/§9 : "les calculs doivent être corrects"). ---
  const totalGeneral = lignesAchat.reduce((somme, l) => somme + l.total, 0);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NOIR);
  doc.text("TOTAL GÉNÉRAL", 360, ligneY + 20);
  doc.text(`${formaterMontant(totalGeneral)} FCFA`, 460, ligneY + 20, { width: MARGE_DROITE - 460, align: "right" });

  dessinerPiedDePage(doc);
}
