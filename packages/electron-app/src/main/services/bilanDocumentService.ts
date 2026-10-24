import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { IdentiteEntrepriseSnapshot } from "@maxi-equip/shared-types";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGE_GAUCHE,
  MARGE_DROITE,
  VERT,
  GRIS_LABEL,
  NOIR,
  formaterMontant,
  dessinerEnTeteEtIdentite,
  dessinerPiedDePage,
  DECALAGE_EN_TETE,
} from "./factureDocumentService.js";

/**
 * Bilan d'activité (2026-10-21) — nouveau type de document, sans modèle
 * papier préexistant à reproduire (contrairement à la facture/document
 * interne, voir leurs propres commentaires) : seules l'identité visuelle
 * partagée (en-tête/pied de page, couleurs, polices — via
 * dessinerEnTeteEtIdentite/dessinerPiedDePage) est reprise telle quelle,
 * pour que ce document ait l'air de faire partie de la même famille.
 */
export interface BilanPdfInput {
  identite: IdentiteEntrepriseSnapshot;
  /** Ex. "01/10/2026 au 21/10/2026" — déjà formaté par l'appelant (BilanScreen connaît le libellé choisi : "Ce mois-ci", etc.). */
  periodeLibelle: string;
  ventes: { caTotal: number; nombreFactures: number; remiseTotale: number };
  /** Vide = aucune vente sur la période, affiché explicitement, jamais masqué. */
  topProduits: { label: string; quantite: number }[];
  mouvements: { totalEntrees: number; totalSorties: number };
  /** Instantané au moment de la génération — le stock n'a pas d'historique "entre deux dates", voir factureRepository.bilanVentesEntre. */
  stockParEmplacement: { nom: string; cartons: number }[];
  produitsSousSeuilCount: number;
  promotionsActivesPendantPeriode: number;
  /** Colonnes dynamiques du tableau détaillé ci-dessous — un dépôt = une colonne "Stock <nom>". */
  depots: { id: string; nom: string }[];
  /**
   * Tableau détaillé par produit (2026-10-22) — PAS de pagination côté
   * écran (décision utilisateur, défilement interne à la place), mais le
   * PDF reste une page physique limitée : contrairement au reste de ce
   * document (toujours une seule page, voir bilanDocumentService.test.ts),
   * cette section SEULE peut déclencher plusieurs pages si le catalogue
   * est trop long (voir dessinerDetailProduits ci-dessous) — jamais une
   * ligne tronquée pour "faire rentrer" le tableau sur une seule page.
   */
  detailProduits: {
    produitId: string;
    motif: string;
    taille: string;
    reference: string;
    stockParEmplacement: { emplacementId: string; cartons: number }[];
    vendu: number;
    sortie: number;
  }[];
}

export async function genererBilanPdf(input: BilanPdfInput): Promise<string> {
  const dossier = join(app.getPath("userData"), "bilans-generes");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
  const chemin = join(dossier, `bilan-${horodatage}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);

    dessinerBilan(doc, input);

    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}

function dessinerSectionTitre(doc: PDFKit.PDFDocument, titre: string, y: number): void {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(VERT).text(titre, MARGE_GAUCHE, y);
  doc.moveTo(MARGE_GAUCHE, y + 15).lineTo(MARGE_DROITE, y + 15).strokeColor("#cccccc").lineWidth(0.6).stroke();
}

function dessinerLigneChiffre(doc: PDFKit.PDFDocument, label: string, valeur: string, y: number): void {
  doc.font("Helvetica").fontSize(9.5).fillColor(GRIS_LABEL).text(label, MARGE_GAUCHE, y, { width: 260 });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NOIR).text(valeur, MARGE_GAUCHE + 260, y, { width: MARGE_DROITE - MARGE_GAUCHE - 260, align: "right" });
}

/**
 * Limite basse de contenu d'une page — juste au-dessus du pied de page
 * (qui démarre à y=774.3, voir dessinerPiedDePage dans
 * factureDocumentService.ts), avec une marge de sécurité pour la hauteur
 * de ligne elle-même (même principe que la régression couverte par
 * bilanDocumentService.test.ts pour le reste du document).
 */
const LIMITE_BAS_CONTENU = 756;

interface ColonneDetailProduit {
  label: string;
  largeur: number;
  align: "left" | "center";
  valeur: (p: BilanPdfInput["detailProduits"][number]) => string;
}

/** Colonnes fixes (Motif/Taille/Référence/Vendu/Sortie) + une colonne par dépôt, largeur répartie sur l'espace restant — jamais un nombre de colonnes figé (dépend du nombre réel de dépôts). */
function construireColonnesDetailProduits(depots: BilanPdfInput["depots"]): ColonneDetailProduit[] {
  const colonnesFixesAvant: ColonneDetailProduit[] = [
    { label: "Motif", largeur: 148, align: "left", valeur: (p) => p.motif },
    { label: "Taille", largeur: 58, align: "left", valeur: (p) => p.taille },
    { label: "Référence", largeur: 88, align: "left", valeur: (p) => p.reference },
  ];
  const colonnesFixesApres: ColonneDetailProduit[] = [
    { label: "Vendu", largeur: 50, align: "center", valeur: (p) => String(p.vendu) },
    { label: "Sortie", largeur: 50, align: "center", valeur: (p) => String(p.sortie) },
  ];
  const largeurFixeTotale = [...colonnesFixesAvant, ...colonnesFixesApres].reduce((s, c) => s + c.largeur, 0);
  const largeurRestante = Math.max(MARGE_DROITE - MARGE_GAUCHE - largeurFixeTotale, 0);
  const largeurParDepot = depots.length > 0 ? largeurRestante / depots.length : 0;
  const colonnesDepots: ColonneDetailProduit[] = depots.map((d) => ({
    label: `Stock ${d.nom}`,
    largeur: largeurParDepot,
    align: "center",
    valeur: (p) => String(p.stockParEmplacement.find((s) => s.emplacementId === d.id)?.cartons ?? 0),
  }));
  return [...colonnesFixesAvant, ...colonnesDepots, ...colonnesFixesApres];
}

function dessinerEnTeteTableDetailProduits(doc: PDFKit.PDFDocument, colonnes: ColonneDetailProduit[], y: number): number {
  let x = MARGE_GAUCHE;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(GRIS_LABEL);
  for (const colonne of colonnes) {
    doc.text(colonne.label, x, y, { width: colonne.largeur, align: colonne.align });
    x += colonne.largeur;
  }
  doc.moveTo(MARGE_GAUCHE, y + 12).lineTo(MARGE_DROITE, y + 12).strokeColor("#cccccc").lineWidth(0.6).stroke();
  return y + 18;
}

function dessinerLigneDetailProduit(doc: PDFKit.PDFDocument, colonnes: ColonneDetailProduit[], ligne: BilanPdfInput["detailProduits"][number], y: number): void {
  let x = MARGE_GAUCHE;
  doc.font("Helvetica").fontSize(8.5).fillColor(NOIR);
  for (const colonne of colonnes) {
    doc.text(colonne.valeur(ligne), x, y, { width: colonne.largeur, align: colonne.align });
    x += colonne.largeur;
  }
}

/**
 * Tableau détaillé par produit — SEULE section de ce document pouvant
 * déclencher plusieurs pages (voir le commentaire sur
 * BilanPdfInput.detailProduits). Le pied de page est redessiné sur CHAQUE
 * page avant de passer à la suivante (`sautDePage`), jamais uniquement
 * sur la dernière — une page intermédiaire sans pied de page serait une
 * régression visuelle silencieuse.
 */
function dessinerDetailProduits(doc: PDFKit.PDFDocument, input: BilanPdfInput, yInitial: number): void {
  const colonnes = construireColonnesDetailProduits(input.depots);

  function dessinerEnTeteContinuation(): number {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(VERT).text("BILAN D'ACTIVITÉ — DÉTAIL PAR PRODUIT (suite)", MARGE_GAUCHE, 50);
    return dessinerEnTeteTableDetailProduits(doc, colonnes, 50 + 22);
  }

  function sautDePage(): number {
    dessinerPiedDePage(doc, input.identite);
    doc.addPage();
    return dessinerEnTeteContinuation();
  }

  let y = yInitial;
  // Si même le titre de section + l'en-tête du tableau + une ligne ne
  // rentrent pas ici, on démarre directement sur une page fraîche —
  // jamais un titre de section dessiné seul, abandonné en bas de page.
  if (y + 46 > LIMITE_BAS_CONTENU) {
    y = sautDePage();
  } else {
    dessinerSectionTitre(doc, "DÉTAIL PAR PRODUIT", y);
    y += 26;
    y = dessinerEnTeteTableDetailProduits(doc, colonnes, y);
  }

  if (input.detailProduits.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(GRIS_LABEL).text("Aucun produit au catalogue.", MARGE_GAUCHE, y);
  } else {
    for (const ligne of input.detailProduits) {
      if (y + 14 > LIMITE_BAS_CONTENU) {
        y = sautDePage();
      }
      dessinerLigneDetailProduit(doc, colonnes, ligne, y);
      y += 14;
    }
  }

  dessinerPiedDePage(doc, input.identite);
}

function dessinerBilan(doc: PDFKit.PDFDocument, input: BilanPdfInput): void {
  const genereLe = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  dessinerEnTeteEtIdentite(doc, input.identite, {
    titre: "BILAN D'ACTIVITÉ",
    ligneReference: `Période : ${input.periodeLibelle}`,
    dateAffichee: genereLe,
  });

  // Correction (2026-10-21, vérifiée par calcul précis des coordonnées
  // plutôt qu'un rendu visuel — voir le fichier de test) : 230 chevauchait
  // la dernière ligne du bloc légal de l'en-tête (texte superposé). 255.5
  // est la valeur déjà utilisée et éprouvée par documentInterneDocumentService.ts
  // pour le premier contenu après ce même en-tête partagé.
  let y = 255.5 + DECALAGE_EN_TETE;

  // --- Ventes ---
  dessinerSectionTitre(doc, "VENTES", y);
  y += 26;
  dessinerLigneChiffre(doc, "Chiffre d'affaires facturé", `${formaterMontant(input.ventes.caTotal)} FCFA`, y);
  y += 16;
  dessinerLigneChiffre(doc, "Nombre de factures", String(input.ventes.nombreFactures), y);
  y += 16;
  dessinerLigneChiffre(doc, "Remises totales accordées", `${formaterMontant(input.ventes.remiseTotale)} FCFA`, y);
  y += 24;

  // --- Produits les plus vendus ---
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NOIR).text("Produits les plus vendus", MARGE_GAUCHE, y);
  y += 14;
  if (input.topProduits.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(GRIS_LABEL).text("Aucune vente enregistrée sur cette période.", MARGE_GAUCHE, y);
    y += 16;
  } else {
    for (const p of input.topProduits) {
      doc.font("Helvetica").fontSize(9).fillColor(NOIR).text(p.label, MARGE_GAUCHE, y, { width: 350 });
      doc.font("Helvetica-Bold").text(`${p.quantite}`, MARGE_GAUCHE + 350, y, { width: MARGE_DROITE - MARGE_GAUCHE - 350, align: "right" });
      y += 14;
    }
  }
  y += 14;

  // --- Mouvements de stock ---
  dessinerSectionTitre(doc, "MOUVEMENTS DE STOCK", y);
  y += 26;
  dessinerLigneChiffre(doc, "Total entrées (toutes périodes confondues sur cette plage)", String(input.mouvements.totalEntrees), y);
  y += 16;
  dessinerLigneChiffre(doc, "Total sorties", String(input.mouvements.totalSorties), y);
  y += 30;

  // --- Stock actuel (instantané) ---
  dessinerSectionTitre(doc, "STOCK ACTUEL (INSTANTANÉ AU MOMENT DU BILAN)", y);
  y += 26;
  for (const d of input.stockParEmplacement) {
    dessinerLigneChiffre(doc, `Stock ${d.nom}`, `${d.cartons} carton(s)`, y);
    y += 16;
  }
  dessinerLigneChiffre(doc, "Produits en alerte de stock (rupture ou sous seuil)", String(input.produitsSousSeuilCount), y);
  y += 30;

  // --- Promotions ---
  dessinerSectionTitre(doc, "PROMOTIONS", y);
  y += 26;
  dessinerLigneChiffre(doc, "Promotions actives pendant la période", String(input.promotionsActivesPendantPeriode), y);
  y += 30;

  // --- Détail par produit (2026-10-22) — seule section pouvant déclencher
  // des pages supplémentaires, voir dessinerDetailProduits ci-dessus. Le
  // pied de page de CETTE page (et de chaque page suivante) est dessiné
  // par cette fonction, jamais ici directement.
  dessinerDetailProduits(doc, input, y);
}
