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
  VERT,
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
 * Document interne — suivi financier des achats extérieurs (correction
 * "Document interne — logique métier de la marge extérieure"). Continue
 * de n'être proposé (voir FacturesScreen.tsx, condition
 * `f.aAchatExterieur`) que lorsqu'au moins une ligne de la vente a
 * nécessité un complément fournisseur externe — logique de détection
 * INCHANGÉE (releves_internes_approvisionnement reste l'unique source
 * de vérité, comme demandé explicitement : "ne pas créer une nouvelle
 * logique inutile").
 *
 * Chaque ligne de PRODUIT (pas de provenance séparée cette fois — la
 * quantité interne et la quantité externe apparaissent sur LA MÊME ligne,
 * exactement la structure demandée) affiche : quantité vendue, quantité
 * interne, quantité extérieure, prix de vente (corrélé avec la ligne de
 * facture correspondante par motif+taille — la facture ne stocke pas
 * cette information séparément par provenance), prix d'achat extérieur
 * (jamais recalculé, vient de lignes_releve_interne.prix_achat), total
 * vente, dépense extérieure, et une MARGE EXTÉRIEURE — jamais un
 * "bénéfice total" (§12 : le coût d'acquisition du stock MAXI EQUIP
 * n'est pas connu du système, la marge calculée ici ne porte QUE sur la
 * partie achetée à l'extérieur).
 *
 * Reprend l'identité visuelle de la facture officielle (logo, filigrane,
 * en-tête, bloc légal, style de tableau, pied de page — via les
 * fonctions partagées dessinerEnTeteEtIdentite/dessinerPiedDePage,
 * jamais un nouveau design inventé).
 *
 * LIMITE CONNUE, signalée pour transparence : le modèle de vente actuel
 * (VenteInput/venteService) ne permet qu'UN SEUL fournisseur externe par
 * ligne de produit — les données sont utilisées telles qu'enregistrées,
 * jamais fusionnées ni inventées.
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

interface LigneCalculee {
  motif: string;
  taille: string;
  quantiteVendue: number;
  quantiteInterne: number;
  quantiteExterne: number;
  prixVente: number;
  prixAchatExterieur: number | null;
  totalVente: number;
  depenseExterieure: number;
  margeExterieure: number;
}

/**
 * Corrèle chaque ligne du relevé interne avec le prix de vente RÉEL de
 * la facture (par motif+taille — même corrélation déjà utilisée ailleurs
 * dans le projet, ex. factureRepository.getDonneesPourModification) :
 * la facture ne connaît que le prix facturé au client, jamais séparé par
 * provenance. Calculs (§6/§7/§8) :
 *   Total vente        = quantité vendue     × prix de vente
 *   Dépense extérieure  = quantité extérieure × prix d'achat extérieur
 *   Marge extérieure    = (quantité extérieure × prix de vente) − dépense extérieure
 * Jamais un bénéfice total — uniquement la marge sur la partie achetée à
 * l'extérieur (§12).
 */
function calculerLignes(facture: Facture, lignes: LigneDocumentInterne[]): LigneCalculee[] {
  return lignes.map((l) => {
    const ligneFacture = facture.lignes.find((lf) => lf.motif === l.motif && lf.taille === l.taille);
    const prixVente = ligneFacture?.prixUnitaire ?? 0;
    const prixAchatExterieur = l.prixAchat;
    const totalVente = l.quantiteTotale * prixVente;
    const depenseExterieure = l.quantiteExterne * (prixAchatExterieur ?? 0);
    const margeExterieure = l.quantiteExterne * prixVente - depenseExterieure;
    return {
      motif: l.motif,
      taille: l.taille,
      quantiteVendue: l.quantiteTotale,
      quantiteInterne: l.quantiteInterne,
      quantiteExterne: l.quantiteExterne,
      prixVente,
      prixAchatExterieur,
      totalVente,
      depenseExterieure,
      margeExterieure,
    };
  });
}

function dessinerDocumentInterne(doc: PDFKit.PDFDocument, { facture, identite, vendeurNomAffiche, lignes }: DocumentInterneInput): void {
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  dessinerEnTeteEtIdentite(doc, identite, {
    titre: "DOCUMENT INTERNE",
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
  // hauteur de ligne). Colonnes EXACTEMENT celles demandées (§5) : une
  // seule ligne par produit, quantité interne ET externe sur la même
  // ligne — jamais scindées en lignes séparées cette fois. ---
  const colonnes = [
    { x: 45.5, largeur: 78, titre: "DÉSIGNATION" },
    { x: 123.5, largeur: 38, titre: "TAILLE" },
    { x: 161.5, largeur: 33, titre: "QTÉ VENDUE" },
    { x: 194.5, largeur: 33, titre: "QTÉ INT." },
    { x: 227.5, largeur: 33, titre: "QTÉ EXT." },
    { x: 260.5, largeur: 51, titre: "PRIX VENTE" },
    { x: 311.5, largeur: 54, titre: "PRIX ACHAT EXT." },
    { x: 365.5, largeur: 56, titre: "TOTAL VENTE" },
    { x: 421.5, largeur: 56, titre: "DÉPENSE EXT." },
    { x: 477.5, largeur: 58.6, titre: "MARGE EXT." },
  ];
  const tableTop = 369.9;
  const headerHeight = 24; // en-tête plus haut : 10 colonnes nécessitent des libellés sur deux lignes
  const rowHeight = 21;

  doc.rect(45, tableTop, 531.1, headerHeight).fillAndStroke("#ffffff", "#cccccc");
  doc.font("Helvetica-Bold").fontSize(6.6).fillColor(NOIR);
  for (const col of colonnes) {
    doc.text(col.titre, col.x + 3, tableTop + 4, { width: col.largeur - 5, align: "left" });
  }

  const lignesCalculees = calculerLignes(facture, lignes);
  let ligneY = tableTop + headerHeight;
  const nombreLignesAffichees = Math.max(lignesCalculees.length, 6);
  doc.font("Helvetica").fontSize(7.6);
  for (let i = 0; i < nombreLignesAffichees; i++) {
    const ligne = lignesCalculees[i];
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
      doc.fillColor(NOIR).font("Helvetica").fontSize(7.6);
      doc.text(ligne.motif, colonnes[0]!.x + 3, ligneY + 6.5, { width: colonnes[0]!.largeur - 5 });
      doc.text(ligne.taille, colonnes[1]!.x + 3, ligneY + 6.5, { width: colonnes[1]!.largeur - 5 });
      doc.text(String(ligne.quantiteVendue), colonnes[2]!.x + 3, ligneY + 6.5, { width: colonnes[2]!.largeur - 5 });
      doc.text(String(ligne.quantiteInterne), colonnes[3]!.x + 3, ligneY + 6.5, { width: colonnes[3]!.largeur - 5 });
      // La quantité extérieure reste mise en évidence (couleur d'accent) —
      // jamais visible sur la facture client.
      doc.fillColor("#b8860b");
      doc.text(String(ligne.quantiteExterne), colonnes[4]!.x + 3, ligneY + 6.5, { width: colonnes[4]!.largeur - 5 });
      doc.fillColor(NOIR);
      doc.text(`${formaterMontant(ligne.prixVente)}`, colonnes[5]!.x + 3, ligneY + 6.5, { width: colonnes[5]!.largeur - 5 });
      doc.text(ligne.prixAchatExterieur !== null ? formaterMontant(ligne.prixAchatExterieur) : "—", colonnes[6]!.x + 3, ligneY + 6.5, {
        width: colonnes[6]!.largeur - 5,
      });
      doc.text(formaterMontant(ligne.totalVente), colonnes[7]!.x + 3, ligneY + 6.5, { width: colonnes[7]!.largeur - 5 });
      doc.text(formaterMontant(ligne.depenseExterieure), colonnes[8]!.x + 3, ligneY + 6.5, { width: colonnes[8]!.largeur - 5 });
      doc.font("Helvetica-Bold");
      doc.text(formaterMontant(ligne.margeExterieure), colonnes[9]!.x + 3, ligneY + 6.5, { width: colonnes[9]!.largeur - 5 });
    }
    ligneY += rowHeight;
  }

  // --- Résumé financier (§11) — même présentation visuelle que "Total à
  // payer" de la facture, trois lignes empilées. Jamais appelé
  // "bénéfice" (§12) : uniquement la marge sur la partie achetée à
  // l'extérieur, le coût d'acquisition du stock MAXI EQUIP n'étant pas
  // connu du système. ---
  const totalVenteGeneral = lignesCalculees.reduce((s, l) => s + l.totalVente, 0);
  const depenseExterieureGenerale = lignesCalculees.reduce((s, l) => s + l.depenseExterieure, 0);
  const margeExterieureGenerale = lignesCalculees.reduce((s, l) => s + l.margeExterieure, 0);

  const resumeY = ligneY + 16;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NOIR);
  doc.text("TOTAL DE LA VENTE", 300, resumeY, { width: 170 });
  doc.text(`${formaterMontant(totalVenteGeneral)} FCFA`, 470, resumeY, { width: MARGE_DROITE - 470, align: "right" });
  doc.text("DÉPENSE EXTÉRIEURE", 300, resumeY + 15, { width: 170 });
  doc.text(`${formaterMontant(depenseExterieureGenerale)} FCFA`, 470, resumeY + 15, { width: MARGE_DROITE - 470, align: "right" });
  doc.fillColor(VERT);
  doc.text("MARGE SUR ACHAT EXTÉRIEUR", 300, resumeY + 30, { width: 170 });
  doc.text(`${formaterMontant(margeExterieureGenerale)} FCFA`, 470, resumeY + 30, { width: MARGE_DROITE - 470, align: "right" });

  dessinerPiedDePage(doc, identite);
}
