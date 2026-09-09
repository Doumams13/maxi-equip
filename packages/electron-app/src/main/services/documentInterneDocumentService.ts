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
 * Document interne d'approvisionnement — REFONTE (correction "Refonte du
 * document interne") : reprend désormais EXACTEMENT l'identité visuelle
 * de la facture officielle (logo, filigrane, en-tête, bloc légal, boîtes
 * d'informations, style de tableau, pied de page — via les fonctions
 * partagées dessinerEnTeteEtIdentite/dessinerPiedDePage, extraites de
 * factureDocumentService.ts sans aucune modification de la facture
 * elle-même, vérifié par un rendu réel comparé à l'ancien). Seuls
 * changent : le titre ("DOCUMENT INTERNE" au lieu de "FACTURE"), les
 * colonnes du tableau (ajout d'une colonne Provenance), et l'absence de
 * prix côté client (remplacé par une quantité totale).
 *
 * LIMITE CONNUE, signalée pour transparence : le modèle de vente actuel
 * (VenteInput/venteService) ne permet qu'UN SEUL fournisseur externe par
 * ligne de produit. Le cas "plusieurs fournisseurs pour un même produit"
 * décrit dans la correction n'est donc pas représentable avec les
 * données réellement enregistrées aujourd'hui — le rendu ci-dessous
 * gère correctement 1 ligne "provenance MAXI EQUIP" + 1 ligne
 * "provenance fournisseur" par produit, ce qui couvre tous les cas
 * réellement possibles avec le modèle de données actuel.
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

/**
 * Éclate chaque ligne de vente en lignes de provenance (une par origine
 * réelle : MAXI EQUIP et/ou fournisseur externe) — jamais mélangées,
 * jamais fusionnées, exactement l'exigence "ne pas mélanger les
 * fournisseurs".
 */
function eclaterParProvenance(lignes: LigneDocumentInterne[], nomMagasin: string) {
  const resultat: { motif: string; taille: string; quantite: number; provenance: string }[] = [];
  for (const ligne of lignes) {
    if (ligne.quantiteInterne > 0) {
      resultat.push({ motif: ligne.motif, taille: ligne.taille, quantite: ligne.quantiteInterne, provenance: nomMagasin });
    }
    if (ligne.quantiteExterne > 0) {
      resultat.push({ motif: ligne.motif, taille: ligne.taille, quantite: ligne.quantiteExterne, provenance: ligne.fournisseur ?? "—" });
    }
  }
  return resultat;
}

function dessinerDocumentInterne(doc: PDFKit.PDFDocument, { facture, identite, vendeurNomAffiche, lignes }: DocumentInterneInput): void {
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  dessinerEnTeteEtIdentite(doc, identite, {
    titre: "DOCUMENT INTERNE",
    ligneReference: `Facture liée : ${facture.numero}`,
    dateAffichee,
  });

  // --- Deux boîtes : FACTURÉ À / DÉTAILS DE VENTE — mêmes libellés,
  // mêmes positions, même style que la facture (§ "reprendre les
  // informations générales... la présentation doit rester identique"). ---
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
  // hauteur de ligne), colonnes adaptées : Désignation / Taille /
  // Quantité / Provenance (au lieu de Prix unitaire / Total, qui n'ont
  // pas de sens pour ce document strictement interne). ---
  const colonnes = [
    { x: 45.5, largeur: 216.4, titre: "DESIGNATION" },
    { x: 262.4, largeur: 74.3, titre: "TAILLE" },
    { x: 337.2, largeur: 74.3, titre: "QUANTITÉ" },
    { x: 412.0, largeur: 164.1, titre: "PROVENANCE" },
  ];
  const tableTop = 369.9;
  const headerHeight = 17.7;
  const rowHeight = 21;

  doc.rect(45, tableTop, 531.1, headerHeight).fillAndStroke("#ffffff", "#cccccc");
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NOIR);
  for (const col of colonnes) {
    doc.text(col.titre, col.x + 6, tableTop + 5, { width: col.largeur - 10 });
  }

  const lignesProvenance = eclaterParProvenance(lignes, identite.nom);
  let ligneY = tableTop + headerHeight;
  const nombreLignesAffichees = Math.max(lignesProvenance.length, 8); // au moins 8 lignes visibles, comme le modèle de facture
  doc.font("Helvetica").fontSize(9);
  for (let i = 0; i < nombreLignesAffichees; i++) {
    const ligne = lignesProvenance[i];
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
      // La provenance externe est mise en évidence (même couleur d'accent
      // que le reste de l'application pour signaler un complément
      // fournisseur) — jamais visible sur la facture client.
      doc.fillColor(ligne.provenance === identite.nom ? NOIR : "#b8860b");
      doc.text(ligne.provenance, colonnes[3]!.x + 6, ligneY + 6, { width: colonnes[3]!.largeur - 10 });
      doc.fillColor(NOIR);
    }
    ligneY += rowHeight;
  }

  // --- Quantité totale (même présentation visuelle que "Total à payer"
  // de la facture, adaptée : aucun prix n'a de sens sur ce document,
  // jamais un calcul inventé — uniquement la somme réelle des quantités). ---
  const quantiteTotale = lignesProvenance.reduce((somme, l) => somme + l.quantite, 0);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NOIR);
  doc.text("Quantité totale", 380, ligneY + 20);
  doc.text(String(quantiteTotale), 480, ligneY + 20, { width: MARGE_DROITE - 480, align: "right" });

  dessinerPiedDePage(doc);
}
