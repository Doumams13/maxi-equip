import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Facture, IdentiteEntrepriseSnapshot } from "@maxi-equip/shared-types";
import { invoicing as domainInvoicing } from "@maxi-equip/domain";

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

export const PAGE_WIDTH = 595.32;
export const PAGE_HEIGHT = 841.92;
export const MARGE_GAUCHE = 45.5;
export const MARGE_DROITE = 576;

export const VERT = "#6ca545";
export const GRIS_LABEL = "#8a8574";
export const FOND_BOITE = "#f3f2ee";
export const NOIR = "#1a1a1a";

function assetPath(nom: string): string {
  // Empaqueté tel quel par electron-vite (voir electron.vite.config.ts,
  // plugin copierAssetsFacture) : dist-main/main/index.cjs → dist-main/assets/.
  // IMPORTANT : un seul niveau ("..") pour remonter de dist-main/main/ à
  // dist-main/, exactement comme les autres références déjà présentes
  // dans main/index.ts (ex. join(__dirname, "../preload")). Un bug réel
  // utilisait ici "../../assets" (deux niveaux), pointant vers un dossier
  // inexistant en dehors de dist-main — d'où le logo absent sur le PDF,
  // masqué en plus par un try/catch silencieux (retiré ci-dessous).
  return join(__dirname, "../assets", nom);
}

/**
 * `toLocaleString("fr-FR")` insère une espace INSÉCABLE (U+00A0) comme
 * séparateur de milliers — bug réel trouvé par inspection visuelle du
 * PDF généré : les polices standard de pdfkit (Helvetica) ne savent pas
 * afficher ce caractère et le remplacent par un symbole incorrect
 * ("9 /600 FCFA" au lieu de "9 600 FCFA"). Corrigé en formatant
 * manuellement avec une espace normale.
 */
export function formaterMontant(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Charge une image dans le document — vérifie explicitement l'existence
 * du fichier et journalise une erreur claire si absent, plutôt qu'un
 * try/catch silencieux (§12 de la correction : c'est exactement ce
 * silence qui a caché le bug de chemin précédent pendant tout ce temps).
 */
function chargerImage(doc: PDFKit.PDFDocument, chemin: string, x: number, y: number, options: { width: number; height: number }): void {
  if (!existsSync(chemin)) {
    // eslint-disable-next-line no-console
    console.error(`[facture-pdf] Image introuvable, jamais laissée en espace vide silencieux : ${chemin}`);
    return;
  }
  try {
    doc.image(chemin, x, y, options);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[facture-pdf] Échec du chargement de l'image ${chemin} :`, err);
  }
}

export interface FactureDocumentInput {
  facture: Facture;
  identite: IdentiteEntrepriseSnapshot;
  vendeurNomAffiche: string;
}

/**
 * En-tête complet (filigrane, logo, titre, référence/date, bloc
 * d'informations légales) — extrait de dessinerFacture() pour être
 * réutilisé tel quel par le document interne (correction "Refonte du
 * document interne" : "reprendre exactement" l'identité visuelle de la
 * facture). Le contenu du titre et de la ligne de référence sont
 * paramétrables ; tout le reste (positions, polices, couleurs, bloc
 * légal) est strictement identique, jamais réinventé.
 */
export function dessinerEnTeteEtIdentite(
  doc: PDFKit.PDFDocument,
  // Non lu depuis l'en-tête raccourci (plus aucune donnée dynamique
  // d'identité n'y figure, voir le bloc légal ci-dessous) — le
  // téléphone est désormais lu dans dessinerPiedDePage. Paramètre
  // conservé pour la cohérence de signature avec le reste du module
  // (toute fonction de dessin reçoit l'identité du document), jamais
  // supprimé pour un gain de lisibilité marginal.
  _identite: IdentiteEntrepriseSnapshot,
  options: { titre: string; ligneReference: string; dateAffichee: string; mentionStatut?: string }
): void {
  // --- Filigrane (derrière tout le reste, tel qu'extrait du PDF officiel) ---
  chargerImage(doc, assetPath("facture-filigrane.png"), 79.2, 293.9, { width: 465, height: 321 });

  // --- Logo couleur (haut gauche) — identique quel que soit le document ---
  chargerImage(doc, assetPath("facture-logo.jpg"), MARGE_GAUCHE, 56.5, { width: 240.1, height: 62.8 });

  // --- Titre + référence + date + statut (haut droite) ---
  doc.font("Helvetica-Bold").fontSize(20).fillColor(VERT).text(options.titre, 340, 60.4, { width: MARGE_DROITE - 340, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(NOIR).text(options.ligneReference, 340, 90.7, { width: MARGE_DROITE - 340, align: "right" });
  doc.text(`Date : ${options.dateAffichee}`, 340, 101.8, { width: MARGE_DROITE - 340, align: "right" });
  if (options.mentionStatut) {
    doc.font("Helvetica-Oblique").fontSize(8).text(options.mentionStatut, 340, 118.4, { width: MARGE_DROITE - 340, align: "right" });
  }

  // --- Bloc informations légales (gauche) — EN-TÊTE RACCOURCI (correction
  // "Facture v2", référence Facture_MAXI_EQUIP final.pdf) : seules les 3
  // lignes d'identité de la société restent ici ; RCCM/NIF/BP/Compte
  // bancaire/e-mail sont déplacés dans le pied de page (voir
  // dessinerPiedDePage ci-dessous), l'adresse/quartier configurables ne
  // figurent plus du tout sur ce document (remplacés par la mention fixe
  // "Siège Social : Libreville" du pied de page, conformément au modèle
  // fourni) — jamais une suppression de donnée, uniquement un déplacement
  // ou un retrait déjà présent dans le modèle de référence.
  doc.font("Helvetica").fontSize(7.6).fillColor(NOIR);
  const lignesLegales = ["Quincaillerie et Vente de Matériaux de Construction", "Import et Export des Matériaux de Construction", "SARLU au Capital Social : 1 000 000 FCFA"];
  let y = 132.6;
  for (const ligne of lignesLegales) {
    doc.text(ligne, MARGE_GAUCHE, y);
    y += 11.15;
  }

  // --- Ligne verte de séparation — remontée pour compenser l'en-tête
  // raccourci (6 lignes en moins × 11.15), reste de l'écart avant les
  // boîtes identique à la version précédente (DECALAGE_EN_TETE
  // réutilisé pour TOUT ce qui suit, voir dessinerFacture). ---
  doc.moveTo(43.6, SEPARATEUR_Y).lineTo(551.9, SEPARATEUR_Y).lineWidth(1.2).strokeColor(VERT).stroke();
}

/**
 * Décalage vertical appliqué à tout ce qui suit l'en-tête (boîtes
 * FACTURÉ À/DÉTAILS DE VENTE, tableau) — l'en-tête raccourci (3 lignes
 * au lieu de 9) libère de l'espace, remonté ici plutôt que laissé vide,
 * pour garder le même rythme visuel que le modèle d'origine (jamais un
 * grand espace blanc inutile) et faire de la place en bas de page pour
 * le nouveau bloc Total/Remise/Total Net + Conditions générales de vente.
 */
export const SEPARATEUR_Y = 178.5;
export const DECALAGE_EN_TETE = SEPARATEUR_Y - 245;

/**
 * Pied de page — strictement identique entre facture et document
 * interne (texte fixe du modèle officiel, jamais modifié).
 */
/**
 * Pied de page — strictement identique entre facture et document
 * interne (texte fixe/dynamique du modèle officiel, jamais modifié
 * différemment entre les deux documents).
 *
 * NOUVEAU PIED DE PAGE (correction "Facture v2", référence
 * Facture_MAXI_EQUIP final.pdf) : remplace l'ancien bloc
 * CNSS/CNAMGS + "Merci pour votre confiance" par les informations
 * légales déplacées depuis l'en-tête (RCCM/NIF/BP/Compte bancaire,
 * désormais ici plutôt que dans le bloc d'identité raccourci — voir
 * dessinerEnTeteEtIdentite) + un e-mail de contact, nouveau sur ce
 * document. Le téléphone reste dynamique (configuré dans Paramètres),
 * jamais codé en dur — seul le reste du texte est fixe, à l'identique
 * du modèle. L'ancienne mention "Administrateur : X • Gérant : Y" reste
 * absente (retirée lors d'une correction précédente, jamais réintroduite).
 */
export function dessinerPiedDePage(doc: PDFKit.PDFDocument, identite: IdentiteEntrepriseSnapshot): void {
  const telephonesAffiches = identite.telephones.length > 0 ? identite.telephones.join(" - ") : "—";
  doc.moveTo(43.6, 748.4).lineTo(551.9, 748.4).lineWidth(0.6).strokeColor("#999999").stroke();
  doc.font("Helvetica-Oblique").fontSize(7.3).fillColor(NOIR);
  const largeur = MARGE_DROITE - MARGE_GAUCHE;
  doc.text("Société à responsabilité limitée, Siège Social : Libreville", MARGE_GAUCHE, 774.3, { width: largeur, align: "center" });
  doc.text(`BP : 22103, Tél : ${telephonesAffiches}, N° de Compte Bancaire : 90000489234-90`, MARGE_GAUCHE, 784.6, { width: largeur, align: "center" });
  doc.text("N° RCCM : GA-LBV-01-2025-B13-00187, NIF : 2025 0100 6503 M", MARGE_GAUCHE, 794.9, { width: largeur, align: "center" });
  doc.text("E-mail : bempatra@gmail.com", MARGE_GAUCHE, 805.2, { width: largeur, align: "center" });
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

/** Exporté pour permettre une vérification réelle (génération d'un vrai PDF, lu visuellement) sans dépendre d'un `app.getPath` Electron — voir factureDocumentService.visuel.test.ts. */
export function dessinerFacture(doc: PDFKit.PDFDocument, { facture, identite, vendeurNomAffiche }: FactureDocumentInput): void {
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  // Statut affiché au client — correction "Réservation / Acompte" :
  // seul statutPaiement apparaît ici (2 valeurs : "Réservation" ou
  // "Payée"), jamais le statut de LIVRAISON, qui reste une information
  // interne à l'application (écran Factures) — décision déjà en place,
  // inchangée. Toujours régénéré à partir de l'état ACTUEL de la facture
  // (jamais figé à la création) : un changement de statut via le menu de
  // l'écran Factures se reflète automatiquement sur le prochain PDF généré.
  const mentionStatut = facture.statutPaiement === "reservation" ? "Statut : Réservation" : "Statut : Payée";
  dessinerEnTeteEtIdentite(doc, identite, { titre: "FACTURE", ligneReference: facture.numero, dateAffichee, mentionStatut });

  // --- Deux boîtes : FACTURÉ À / DÉTAILS DE VENTE — décalées vers le
  // haut de DECALAGE_EN_TETE pour compenser l'en-tête raccourci (voir
  // dessinerEnTeteEtIdentite), jamais un redesign : même rythme, même
  // style, juste remonté. ---
  doc.rect(45.2, 255.5 + DECALAGE_EN_TETE, 259.4, 78.7).fill(FOND_BOITE);
  doc.rect(304.9, 255.5 + DECALAGE_EN_TETE, 259.2, 78.7).fill(FOND_BOITE);

  doc.font("Helvetica-Bold").fontSize(8).fillColor(GRIS_LABEL);
  doc.text("FACTURÉ À", 55.2, 265.2 + DECALAGE_EN_TETE);
  doc.text("DÉTAILS DE VENTE", 314.7, 265.2 + DECALAGE_EN_TETE);

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NOIR);
  doc.text(facture.clientNom, 55.2, 279.3 + DECALAGE_EN_TETE);
  doc.font("Helvetica").text(facture.clientTelephone ?? "—", 55.2, 291.9 + DECALAGE_EN_TETE);
  doc.text(facture.clientAdresse ?? "—", 55.2, 304.0 + DECALAGE_EN_TETE);

  doc.font("Helvetica").fontSize(9.5).fillColor(NOIR);
  doc.text(`Magasin : ${identite.nom}`, 314.7, 279.3 + DECALAGE_EN_TETE);
  doc.text(`Nombre d'articles : ${facture.lignes.length}`, 314.7, 291.9 + DECALAGE_EN_TETE);
  doc.text(`Mode de règlement : ${facture.modeReglement ?? "—"}`, 314.7, 304.0 + DECALAGE_EN_TETE);
  doc.text(`Vendeur : ${vendeurNomAffiche}`, 314.7, 316.1 + DECALAGE_EN_TETE);

  // --- Tableau ---
  const colonnes = [
    { x: 45.5, largeur: 135, titre: "DESIGNATION" },
    { x: 181, largeur: 75, titre: "REFERENCE" },
    { x: 256.5, largeur: 55, titre: "TAILLE" },
    { x: 312, largeur: 50, titre: "QTÉ" },
    { x: 362.5, largeur: 93, titre: "PRIX UNITAIRE" },
    { x: 456, largeur: 119.6, titre: "TOTAL" },
  ];
  const tableTop = 369.9 + DECALAGE_EN_TETE;
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
      doc.text(ligne.reference ?? "—", colonnes[1]!.x + 6, ligneY + 6, { width: colonnes[1]!.largeur - 10 });
      doc.text(ligne.taille, colonnes[2]!.x + 6, ligneY + 6, { width: colonnes[2]!.largeur - 10 });
      doc.text(String(ligne.quantite), colonnes[3]!.x + 6, ligneY + 6, { width: colonnes[3]!.largeur - 10 });
      doc.text(`${formaterMontant(ligne.prixUnitaire)} FCFA`, colonnes[4]!.x + 6, ligneY + 6, { width: colonnes[4]!.largeur - 10 });
      doc.text(`${formaterMontant(ligne.quantite * ligne.prixUnitaire)} FCFA`, colonnes[5]!.x + 6, ligneY + 6, {
        width: colonnes[5]!.largeur - 10,
      });
    }
    ligneY += rowHeight;
  }

  // --- Total / Remise / Total Net à payer (correction "Remise /
  // Négociation", référence Facture_MAXI_EQUIP final.pdf) — remplace
  // l'ancienne ligne unique "Total à payer". `Total` reste la somme des
  // lignes AVANT remise (jamais modifié par la remise, voir
  // shared-types/facture.ts) ; la remise et le total net sont calculés
  // ici à l'affichage, jamais stockés redondamment ailleurs que sur
  // `facture.remise` elle-même.
  const totalNet = domainInvoicing.calculerTotalNet(facture.total, facture.remise);
  const labelX = 380;
  const valeurX = 480;
  const valeurLargeur = MARGE_DROITE - valeurX;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(NOIR);
  doc.text("Total", labelX, ligneY + 18);
  doc.text(`${formaterMontant(facture.total)} FCFA`, valeurX, ligneY + 18, { width: valeurLargeur, align: "right" });

  doc.text("Remise", labelX, ligneY + 33);
  doc.text(`${formaterMontant(facture.remise)} FCFA`, valeurX, ligneY + 33, { width: valeurLargeur, align: "right" });

  // --- Correction "Réservation / Acompte" : une réservation affiche
  // l'acompte versé et le solde restant au lieu d'un unique "Total Net à
  // payer" (qui suppose un règlement intégral) — jamais les deux
  // affichages simultanément, cette ligne occupe TOUJOURS la même
  // position (ligneY + 50), seul son contenu change selon le statut.
  // Ajoute une ligne de plus (`decalageCgv`) pour la réservation, jamais
  // de chevauchement avec le bloc CGV qui suit.
  let decalageCgv = 0;
  if (facture.statutPaiement === "reservation") {
    const soldeRestant = domainInvoicing.calculerSoldeRestant(totalNet, facture.montantPaye);
    doc.fillColor(VERT);
    doc.text("Acompte versé", labelX, ligneY + 50);
    doc.text(`${formaterMontant(facture.montantPaye)} FCFA`, valeurX, ligneY + 50, { width: valeurLargeur, align: "right" });
    doc.fillColor(NOIR);
    doc.text("Solde restant à payer", labelX, ligneY + 67);
    doc.text(`${formaterMontant(soldeRestant)} FCFA`, valeurX, ligneY + 67, { width: valeurLargeur, align: "right" });
    decalageCgv = 17;
  } else {
    doc.fillColor(VERT);
    doc.text("Total Net à payer", labelX, ligneY + 50);
    doc.text(`${formaterMontant(totalNet)} FCFA`, valeurX, ligneY + 50, { width: valeurLargeur, align: "right" });
  }

  // --- Conditions générales de vente (NOUVEAU, référence
  // Facture_MAXI_EQUIP final.pdf) — texte fixe, jamais paramétrable.
  // Positionnement en flux (doc.y, jamais une coordonnée fixe devinée) :
  // la hauteur réelle du bloc Total/Remise ci-dessus varie légèrement
  // selon la police, plus sûr de repartir du curseur réel de pdfkit que
  // de recalculer une position à la main — jamais de chevauchement avec
  // le pied de page, quel que soit le nombre de lignes du tableau
  // au-dessus (déjà borné à 8 minimum par nombreLignesAffichees).
  doc.y = ligneY + 76 + decalageCgv;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(VERT);
  doc.text("CONDITIONS GENERALES DE VENTE", MARGE_GAUCHE, doc.y, { width: MARGE_DROITE - MARGE_GAUCHE });
  doc.moveDown(0.4);
  doc.font("Helvetica-Oblique").fontSize(7.2).fillColor(NOIR);
  doc.text(
    "1. Réservation : Toutes somme versée dans le cadre d'une réservation sera considérée comme un acompte non remboursable en cas d'annulation ou de désistement de l'acheteur. Sous réserve des cas de force majeure, tout acompte versé constituera un avoir au profit de l'acheteur et sera valable pendant un délai de quinze (15) jours.",
    MARGE_GAUCHE,
    doc.y,
    { width: MARGE_DROITE - MARGE_GAUCHE, align: "justify" }
  );
  doc.moveDown(0.3);
  doc.text(
    "2. Livraison : Le client dispose d'un délai de quinze (15) jours pour prendre livraison des marchandises achetées et payées.",
    MARGE_GAUCHE,
    doc.y,
    { width: MARGE_DROITE - MARGE_GAUCHE, align: "justify" }
  );
  doc.moveDown(0.3);
  doc.text(
    "3. Marchandise avec mention payé non livrée : Le client dispose d'un délai de trente (30) jours au-delà duquel le vendeur ne garantit pas la disponibilité du stock.",
    MARGE_GAUCHE,
    doc.y,
    { width: MARGE_DROITE - MARGE_GAUCHE, align: "justify" }
  );

  dessinerPiedDePage(doc, identite);
}
