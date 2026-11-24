import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { IdentiteEntrepriseSnapshot, UniteVente } from "@maxi-equip/shared-types";
import { uniteVenteEffective, LIBELLE_UNITE_VENTE } from "@maxi-equip/shared-types";
import { devis as domainDevis } from "@maxi-equip/domain";
import type { Devis, LigneDevis } from "../repositories/devisRepository.js";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGE_GAUCHE,
  MARGE_DROITE,
  VERT,
  GRIS_LABEL,
  FOND_BOITE,
  NOIR,
  SEPARATEUR_Y,
  formaterMontant,
  dessinerEnTeteEtIdentite,
  dessinerPiedDePage,
} from "./factureDocumentService.js";

/**
 * FACTURE PROFORMA (devis) — point 6 de la liste du 2026-11-23, d'après le
 * modèle fourni "Proforma_MAXI_EQUIP_Remises_5_10_Ciment_Sans_Remise" :
 * état du devis, détail par espace/application (format, surface/besoin,
 * quantité, P.U., remise, net), récapitulatif par format, total net
 * estimatif, hypothèses/notes et mention "estimation". Reprend l'identité
 * visuelle de la facture (logo, filigrane, en-tête, pied de page légal —
 * fonctions partagées de factureDocumentService.ts, jamais un second
 * design). Pagination réelle : tableau et notes continuent sur les pages
 * suivantes, chaque page porte l'en-tête et le pied de page.
 */
export interface DevisDocumentInput {
  devis: Devis;
  identite: IdentiteEntrepriseSnapshot;
  vendeurNomAffiche: string | null;
}

const LIMITE_BAS = 735; // au-dessus du pied de page légal (ligne grise à 748.4)
const LARGEUR = MARGE_DROITE - MARGE_GAUCHE;
const BLANC = "#ffffff";
const ZEBRE = "#f6f8f3";

const ABREVIATION_UNITE: Record<UniteVente, { singulier: string; pluriel: string }> = {
  carton: { singulier: "ctn", pluriel: "ctn" },
  piece: { singulier: "p.", pluriel: "p." },
  sac: { singulier: "sac", pluriel: "sacs" },
  metre: { singulier: "m", pluriel: "m" },
  kg: { singulier: "kg", pluriel: "kg" },
  litre: { singulier: "L", pluriel: "L" },
};

function uniteLigne(l: LigneDevis): UniteVente {
  return uniteVenteEffective({ uniteVente: (l.uniteVente as UniteVente | null | undefined) ?? null });
}

/** Nombre décimal sans espace insécable (même raison que formaterMontant). */
function formaterNombre(n: number, decimales = 3): string {
  const arrondi = Math.round(n * 10 ** decimales) / 10 ** decimales;
  const [entier, fraction] = arrondi.toString().split(".");
  const entierFormate = entier!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${entierFormate},${fraction}` : entierFormate;
}

function quantiteAvecUnite(q: number, unite: UniteVente, abrege: boolean): string {
  const libelle = abrege ? ABREVIATION_UNITE[unite] : LIBELLE_UNITE_VENTE[unite];
  return `${formaterNombre(q)} ${q > 1 ? libelle.pluriel : libelle.singulier}`;
}

export async function genererDevisPdf(input: DevisDocumentInput): Promise<string> {
  const dossier = join(app.getPath("userData"), "devis-generes");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, `${input.devis.numero}.pdf`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0, bufferPages: true });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);
    dessinerDevis(doc, input);
    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}

/** Exporté pour une vérification réelle (PDF relu par pdfjs) sans dépendre d'Electron — voir devisDocumentService.test.ts. Le document DOIT être créé avec `bufferPages: true`. */
export function dessinerDevis(doc: PDFKit.PDFDocument, { devis, identite, vendeurNomAffiche }: DevisDocumentInput): void {
  const dateAffichee = new Date(devis.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const statut =
    devis.statut === "convertie" ? "Devis converti en vente" : devis.statut === "annulee" ? "Devis annulé" : "Devis provisoire, non payé";
  const enTete = () =>
    dessinerEnTeteEtIdentite(doc, identite, {
      titre: "FACTURE PROFORMA",
      ligneReference: `N° ${devis.numero} (provisoire)`,
      dateAffichee,
      mentionStatut: statut,
    });
  const nouvellePage = (): number => {
    doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    enTete();
    return SEPARATEUR_Y + 16;
  };

  enTete();
  let y = SEPARATEUR_Y + 14;

  // --- ÉTAT DU DEVIS ---
  y = titreSection(doc, "ÉTAT DU DEVIS", y);
  const hauteurBoite = 58;
  doc.rect(MARGE_GAUCHE, y, LARGEUR, hauteurBoite).fill(FOND_BOITE);
  const client = devis.clientNom.trim() || "à renseigner";
  const contact = [devis.clientTelephone, devis.clientAdresse].filter((v) => v && v.trim()).join(" · ");
  const colGauche = MARGE_GAUCHE + 10;
  const colDroite = MARGE_GAUCHE + LARGEUR / 2 + 5;
  const largeurCol = LARGEUR / 2 - 15;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(NOIR).text(`Client : `, colGauche, y + 9, { continued: true });
  doc.font("Helvetica").text(client + (contact ? ` (${contact})` : ""), { width: largeurCol });
  doc.font("Helvetica-Bold").text("Objet : ", colGauche, y + 25, { continued: true });
  doc.font("Helvetica").text(devis.objet?.trim() || "—", { width: largeurCol, height: 28, ellipsis: true });
  doc.font("Helvetica-Bold").text("Statut : ", colDroite, y + 9, { continued: true });
  doc.font("Helvetica").text(statut.charAt(0).toLowerCase() + statut.slice(1), { width: largeurCol });
  doc.font("Helvetica-Bold").text("Règlement prévu : ", colDroite, y + 25, { continued: true });
  doc.font("Helvetica").text(devis.modeReglement?.trim() || "—", { width: largeurCol });
  if (vendeurNomAffiche) {
    doc.font("Helvetica-Bold").text("Établi par : ", colDroite, y + 41, { continued: true });
    doc.font("Helvetica").text(vendeurNomAffiche, { width: largeurCol });
  }
  y += hauteurBoite + 16;

  // --- DÉTAIL ---
  const colonnes = [
    // Demande utilisateur (2026-11-24) : une seule colonne "DÉSIGNATION /
    // RÉFÉRENCE" — la référence pour un carreau, le nom du produit pour
    // tout le reste ; l'espace éventuel (Salon, Cuisine…) suit en petit.
    { titre: "DÉSIGNATION / RÉFÉRENCE", largeur: 174, align: "left" as const },
    { titre: "FORMAT", largeur: 58, align: "left" as const },
    { titre: "SURFACE / BESOIN", largeur: 58, align: "left" as const },
    { titre: "QTÉ", largeur: 46, align: "left" as const },
    { titre: "P.U.", largeur: 54, align: "right" as const },
    { titre: "REMISE", largeur: 68, align: "right" as const },
    { titre: "NET FCFA", largeur: LARGEUR - (174 + 58 + 58 + 46 + 54 + 68), align: "right" as const },
  ];
  const hauteurEnTeteTableau = 22;
  const hauteurLigne = 19;
  const dessinerEnTeteTableau = (yTab: number): number => {
    doc.rect(MARGE_GAUCHE, yTab, LARGEUR, hauteurEnTeteTableau).fill(VERT);
    let x = MARGE_GAUCHE;
    doc.font("Helvetica-Bold").fontSize(7).fillColor(BLANC);
    for (const c of colonnes) {
      // Titre sur deux lignes (ex. "SURFACE / BESOIN") centré verticalement dans la bande, jamais coupé.
      const deuxLignes = doc.heightOfString(c.titre, { width: c.largeur - 8 }) > 10;
      doc.text(c.titre, x + 4, yTab + (deuxLignes ? 4 : 8), { width: c.largeur - 8, align: c.align });
      x += c.largeur;
    }
    return yTab + hauteurEnTeteTableau;
  };

  y = titreSection(doc, "DÉTAIL DES ESPACES ET FOURNITURES", y);
  y = dessinerEnTeteTableau(y);
  devis.lignes.forEach((ligne, index) => {
    if (y + hauteurLigne > LIMITE_BAS) {
      y = nouvellePage();
      y = titreSection(doc, "DÉTAIL DES ESPACES ET FOURNITURES (SUITE)", y);
      y = dessinerEnTeteTableau(y);
    }
    if (index % 2 === 1) doc.rect(MARGE_GAUCHE, y, LARGEUR, hauteurLigne).fill(ZEBRE);
    const unite = uniteLigne(ligne);
    const m = domainDevis.calculerLigneDevis({ quantite: ligne.quantite, prixUnitaire: ligne.prixUnitaire, remisePourcent: ligne.remisePourcent ?? 0 });
    const pourcent = ligne.remisePourcent ?? 0;
    const valeurs = [
      designationOuReference(ligne),
      ligne.taille,
      ligne.surfaceM2 ? `${formaterNombre(ligne.surfaceM2)} m²` : quantiteAvecUnite(ligne.quantite, unite, false),
      quantiteAvecUnite(ligne.quantite, unite, true),
      formaterMontant(ligne.prixUnitaire),
      m.remise > 0 ? `${formaterMontant(m.remise)} (${formaterNombre(pourcent, 2)} %)` : "0",
      formaterMontant(m.net),
    ];
    let x = MARGE_GAUCHE;
    doc.font("Helvetica").fontSize(7.8).fillColor(NOIR);
    colonnes.forEach((c, i) => {
      doc.text(valeurs[i]!, x + 4, y + 6, { width: c.largeur - 8, align: c.align, height: hauteurLigne - 6, ellipsis: true, lineBreak: false });
      x += c.largeur;
    });
    doc.moveTo(MARGE_GAUCHE, y + hauteurLigne).lineTo(MARGE_DROITE, y + hauteurLigne).lineWidth(0.4).strokeColor("#dddddd").stroke();
    y += hauteurLigne;
  });
  if (devis.lignes.some((l) => uniteLigne(l) === "carton")) {
    if (y + 18 > LIMITE_BAS) y = nouvellePage();
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(GRIS_LABEL).text("Quantités arrondies au carton entier pour chaque espace.", MARGE_GAUCHE, y + 6, { width: LARGEUR });
    y += 18;
  }
  y += 12;

  // --- RÉCAPITULATIF PAR FORMAT ---
  const groupes = new Map<string, { libelle: string; unite: UniteVente; quantite: number; brut: number; remise: number; net: number }>();
  for (const l of devis.lignes) {
    const unite = uniteLigne(l);
    const cle = `${l.taille}|${unite}`;
    const m = domainDevis.calculerLigneDevis({ quantite: l.quantite, prixUnitaire: l.prixUnitaire, remisePourcent: l.remisePourcent ?? 0 });
    const g = groupes.get(cle) ?? { libelle: l.taille, unite, quantite: 0, brut: 0, remise: 0, net: 0 };
    g.quantite += l.quantite;
    g.brut += m.brut;
    g.remise += m.remise;
    g.net += m.net;
    groupes.set(cle, g);
  }
  const totaux = domainDevis.calculerTotauxDevis(
    devis.lignes.map((l) => ({ quantite: l.quantite, prixUnitaire: l.prixUnitaire, remisePourcent: l.remisePourcent ?? 0 })),
    devis.remiseGlobale
  );
  const colonnesRecap = [
    { titre: "FORMAT / DÉSIGNATION", largeur: 170, align: "left" as const },
    { titre: "QUANTITÉ", largeur: 100, align: "left" as const },
    { titre: "BRUT FCFA", largeur: 90, align: "right" as const },
    { titre: "REMISE", largeur: 80, align: "right" as const },
    { titre: "NET FCFA", largeur: LARGEUR - 440, align: "right" as const },
  ];
  const lignesRecap: { valeurs: string[]; gras?: boolean }[] = [...groupes.values()].map((g) => ({
    valeurs: [g.libelle, quantiteAvecUnite(g.quantite, g.unite, false), formaterMontant(g.brut), formaterMontant(g.remise), formaterMontant(g.net)],
  }));
  if (totaux.remiseGlobale > 0) {
    lignesRecap.push({ valeurs: ["Remise supplémentaire", "", "", formaterMontant(totaux.remiseGlobale), `- ${formaterMontant(totaux.remiseGlobale)}`] });
  }
  lignesRecap.push({ valeurs: ["TOTAL", "", formaterMontant(totaux.brut), formaterMontant(totaux.remiseTotale), formaterMontant(totaux.net)], gras: true });

  const hauteurRecap = hauteurEnTeteTableau + lignesRecap.length * hauteurLigne + 40;
  if (y + Math.min(hauteurRecap, 200) > LIMITE_BAS) y = nouvellePage();
  y = titreSection(doc, "RÉCAPITULATIF PAR FORMAT", y);
  const enTeteRecap = (yTab: number): number => {
    doc.rect(MARGE_GAUCHE, yTab, LARGEUR, hauteurEnTeteTableau).fill(VERT);
    let x = MARGE_GAUCHE;
    doc.font("Helvetica-Bold").fontSize(7).fillColor(BLANC);
    for (const c of colonnesRecap) {
      doc.text(c.titre, x + 4, yTab + 8, { width: c.largeur - 8, align: c.align, lineBreak: false });
      x += c.largeur;
    }
    return yTab + hauteurEnTeteTableau;
  };
  y = enTeteRecap(y);
  for (const [index, ligne] of lignesRecap.entries()) {
    if (y + hauteurLigne > LIMITE_BAS) {
      y = nouvellePage();
      y = enTeteRecap(y);
    }
    if (ligne.gras) doc.rect(MARGE_GAUCHE, y, LARGEUR, hauteurLigne).fill(FOND_BOITE);
    else if (index % 2 === 1) doc.rect(MARGE_GAUCHE, y, LARGEUR, hauteurLigne).fill(ZEBRE);
    let x = MARGE_GAUCHE;
    doc.font(ligne.gras ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(NOIR);
    colonnesRecap.forEach((c, i) => {
      doc.text(ligne.valeurs[i]!, x + 4, y + 6, { width: c.largeur - 8, align: c.align, lineBreak: false });
      x += c.largeur;
    });
    doc.moveTo(MARGE_GAUCHE, y + hauteurLigne).lineTo(MARGE_DROITE, y + hauteurLigne).lineWidth(0.4).strokeColor("#dddddd").stroke();
    y += hauteurLigne;
  }
  if (y + 30 > LIMITE_BAS) y = nouvellePage();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(VERT).text(`TOTAL NET ESTIMATIF : ${formaterMontant(totaux.net)} FCFA`, MARGE_GAUCHE, y, { width: LARGEUR, align: "right" });
  y += 28;

  // --- HYPOTHÈSES / NOTES (texte libre, paginé) ---
  const notes = devis.notes?.trim();
  if (notes) {
    if (y + 40 > LIMITE_BAS) y = nouvellePage();
    y = titreSection(doc, "HYPOTHÈSES DE CALCUL ET CONDITIONS", y);
    doc.font("Helvetica").fontSize(8.3).fillColor(NOIR);
    for (const paragraphe of notes.split(/\n+/)) {
      const hauteur = doc.heightOfString(paragraphe, { width: LARGEUR });
      if (y + hauteur > LIMITE_BAS) y = nouvellePage();
      doc.text(paragraphe, MARGE_GAUCHE, y, { width: LARGEUR });
      y += hauteur + 5;
    }
    y += 8;
  }

  // --- Mention finale ---
  if (y + 20 > LIMITE_BAS) y = nouvellePage();
  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor(GRIS_LABEL)
    .text("Ce document est une estimation commerciale et ne constitue ni une facture payée ni une commande ferme.", MARGE_GAUCHE, y, { width: LARGEUR });

  // --- Pied de page légal + numéro de page sur chaque page ---
  const plage = doc.bufferedPageRange();
  for (let i = plage.start; i < plage.start + plage.count; i++) {
    doc.switchToPage(i);
    dessinerPiedDePage(doc, identite);
    doc.font("Helvetica").fontSize(7.3).fillColor(GRIS_LABEL).text(`Page ${i - plage.start + 1} / ${plage.count}`, MARGE_GAUCHE, 755, { width: LARGEUR, align: "right", lineBreak: false });
  }
}

/** Référence pour un carreau (vendu au carton), nom du produit sinon ; espace éventuel ajouté après. */
function designationOuReference(ligne: LigneDevis): string {
  const estCarreau = uniteLigne(ligne) === "carton" || ligne.surfaceCartonM2 != null;
  const principal = (estCarreau ? ligne.reference?.trim() : null) || ligne.motif;
  const espace = ligne.espace?.trim();
  return espace ? `${principal} · ${espace}` : principal;
}

function titreSection(doc: PDFKit.PDFDocument, titre: string, y: number): number {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(VERT).text(titre, MARGE_GAUCHE, y, { width: LARGEUR, lineBreak: false });
  return y + 18;
}
