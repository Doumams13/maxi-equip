import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Facture, IdentiteEntrepriseSnapshot } from "@maxi-equip/shared-types";
import { uniteVenteEffective, LIBELLE_UNITE_VENTE, caracteristiquesAffichage } from "@maxi-equip/shared-types";
import { invoicing as domainInvoicing, pricing as domainPricing } from "@maxi-equip/domain";

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

/**
 * Dimensions ISO A5 réelles (148 × 210 mm) — correction "facture A4
 * paysage" (Phase 4) : servent désormais UNIQUEMENT à calculer l'échelle
 * de réduction de la facture A4 complète pour chaque panneau du format
 * paysage (voir `dessinerFactureA4Paysage`) — ne décrivent plus une
 * mise en page A5 dédiée (celle-ci, `dessinerFactureA5`, a été retirée :
 * elle produisait un document DIFFÉRENT de la facture officielle,
 * jamais une simple réduction de celle-ci).
 */
export const PAGE_WIDTH_A5 = 419.53;
export const PAGE_HEIGHT_A5 = 595.28;

/**
 * Format A4 paysage — deux exemplaires de la facture A4 portrait
 * COMPLÈTE, réduits à l'échelle et placés côte à côte (Phase 4).
 * Dimensions ISO A4 paysage NOMINALES (l'inverse exact de
 * PAGE_WIDTH/PAGE_HEIGHT ci-dessus) — jamais le double exact de
 * PAGE_WIDTH_A5 (839.06pt, ~1mm plus étroit) : priorité donnée à une
 * impression correcte sur une vraie feuille A4, les deux panneaux sont
 * centrés dans cette largeur avec une fine marge extérieure de chaque côté.
 */
export const PAGE_WIDTH_A4_PAYSAGE = PAGE_HEIGHT;
export const PAGE_HEIGHT_A4_PAYSAGE = PAGE_WIDTH;

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

function capitaliser(mot: string): string {
  return mot.length === 0 ? mot : mot.charAt(0).toUpperCase() + mot.slice(1);
}

/**
 * Vrai si TOUTES les lignes sont vendues au carton (`uniteVenteEffective`
 * — `null`/absent toujours traité comme carton, même règle que partout
 * ailleurs dans le projet). Pilote le choix entre libellés historiques
 * et génériques — fondations quincaillerie (Phase 4), partagée par les
 * formats A4 et A5 (contenu de panneau du format paysage), jamais deux
 * règles distinctes.
 */
function facturePrincipalementAuCarton(facture: Facture): boolean {
  return facture.lignes.length > 0 && facture.lignes.every((l) => uniteVenteEffective({ uniteVente: l.uniteVente ?? null }) === "carton");
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
  /**
   * "a4-paysage" par défaut (Phase 4) — deux exemplaires A5 identiques
   * côte à côte sur une page A4 paysage, remplace l'ancien choix "a5"
   * indépendant (retiré, voir FacturesScreen.tsx). "a4" reproduit le
   * modèle officiel existant à l'identique, jamais modifié.
   */
  format?: FormatFacture;
  /**
   * Retour client du 2026-11-24 (illustration validée) — en A4 paysage
   * (2 × A5) : facture client à gauche, DOCUMENT INTERNE à droite (une
   * ligne par article, quantité interne ventilée par dépôt, achat
   * extérieur et marge — voir dessinerPageDocumentInterne). Absent = deux
   * exemplaires client identiques (comportement historique).
   */
  copieInterne?: DocumentInterneDonnees;
}

/**
 * Format d'impression (retour client du 2026-11-24) : "auto" = A5 (2 par
 * feuille : facture + document interne) jusqu'à SEUIL_ARTICLES_A5 articles,
 * A4 au-delà (facture puis document interne dans le même fichier). "a4" et
 * "a4-paysage" restent forçables depuis l'écran Factures.
 */
export type FormatFacture = "auto" | "a4" | "a4-paysage";
export const SEUIL_ARTICLES_A5 = 13;

export function resoudreFormatFacture(format: FormatFacture | undefined, nombreArticles: number): "a4" | "a4-paysage" {
  const demande = format ?? "auto";
  if (demande !== "auto") return demande;
  return nombreArticles <= SEUIL_ARTICLES_A5 ? "a4-paysage" : "a4";
}

/** Une ligne du document interne — une par ligne de facture, dans le même ordre. */
export interface LigneDocumentInterneV2 {
  /** Référence pour un carreau, nom du produit sinon (retour client du 2026-11-24). */
  designation: string;
  taille: string;
  vendu: number;
  /** Quantité sortie de chaque dépôt, dans l'ordre de `DocumentInterneDonnees.depots`. */
  parDepot: number[];
  externe: number;
  prixVente: number;
  prixAchat: number | null;
}

export interface DocumentInterneDonnees {
  /** Noms des dépôts — une sous-colonne "QTÉ INTERNE" par dépôt (ex. Akanda | Akébé). */
  depots: string[];
  lignes: LigneDocumentInterneV2[];
}

/**
 * Construit les lignes du document interne à partir des données RÉELLES
 * de la vente (snapshot des lignes de facture, mouvements de sortie par
 * dépôt, relevé d'achat extérieur) — même corrélation que l'ancien
 * document (référence ou motif + taille), jamais une donnée inventée. Si
 * un même article figure sur plusieurs lignes de facture, ses sorties de
 * dépôt et son achat extérieur sont portés par la première de ces lignes.
 */
export function construireDocumentInterne(
  facture: Pick<Facture, "lignes">,
  repartitionDepots: { motif: string; taille: string; reference: string | null; emplacementNom: string; quantite: number }[],
  achatsExterieurs: { motif: string; taille: string; quantiteExterne: number; prixAchat: number | null }[],
  depots: string[],
  estCarreau: (produitId: string | null) => boolean
): DocumentInterneDonnees {
  const cle = (reference: string | null, motif: string, taille: string) => `${(reference ?? "").trim() || motif}|${taille}`;
  const colonnes = [...depots];
  for (const r of repartitionDepots) if (!colonnes.includes(r.emplacementNom)) colonnes.push(r.emplacementNom);
  const dejaPortee = new Set<string>();
  const lignes = facture.lignes.map((l) => {
    const k = cle(l.reference, l.motif, l.taille);
    const premiere = !dejaPortee.has(k);
    dejaPortee.add(k);
    const achat = premiere ? achatsExterieurs.find((a) => a.motif === l.motif && a.taille === l.taille) : undefined;
    return {
      designation: estCarreau(l.produitId) ? (l.reference?.trim() || l.motif) : l.motif,
      taille: l.taille,
      vendu: l.quantite,
      parDepot: colonnes.map((d) =>
        premiere ? repartitionDepots.filter((r) => r.emplacementNom === d && cle(r.reference, r.motif, r.taille) === k).reduce((s2, r) => s2 + r.quantite, 0) : 0
      ),
      externe: achat?.quantiteExterne ?? 0,
      prixVente: l.prixUnitaire,
      prixAchat: achat?.prixAchat ?? null,
    };
  });
  return { depots: colonnes, lignes };
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
  doc.text("E-mail : contact@maxi-equip.com", MARGE_GAUCHE, 805.2, { width: largeur, align: "center" });
}

/**
 * Génère le PDF de la facture et l'enregistre sur disque. Retourne le
 * chemin du fichier — jamais recréé si déjà généré pour la même facture
 * avec les mêmes données (le nom de fichier est déterministe, basé sur
 * le numéro de facture, §3/§4 : "cliquer plusieurs fois ne doit pas
 * créer plusieurs factures/numéros").
 */
export async function genererFacturePdf(input: FactureDocumentInput): Promise<string> {
  const format = resoudreFormatFacture(input.format, input.facture.lignes.length);
  const dossier = join(app.getPath("userData"), "factures-generees");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, `${input.facture.numero}.pdf`);

  return new Promise((resolve, reject) => {
    const taille: [number, number] = format === "a4" ? [PAGE_WIDTH, PAGE_HEIGHT] : [PAGE_WIDTH_A4_PAYSAGE, PAGE_HEIGHT_A4_PAYSAGE];
    const doc = new PDFDocument({ size: taille, margin: 0 });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);

    if (format === "a4") {
      dessinerFacture(doc, input);
      // A4 automatique (plus de SEUIL_ARTICLES_A5 articles) : le document
      // interne suit la facture dans le même fichier, sur ses propres pages.
      if (input.copieInterne) {
        const plan = planifierPagesFacture(input.facture);
        plan.pages.forEach((_, indexPage) => {
          doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
          dessinerPageDocumentInterne(doc, input, input.copieInterne!, plan, indexPage);
        });
      }
    }
    else dessinerFactureA4Paysage(doc, input);

    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}

/**
 * Pagination de la facture (0.12.6, 2026-11-24 — "facture à 16 articles :
 * totaux et CGV par-dessus le pied de page"). Jusqu'ici la facture tenait
 * TOUJOURS sur une page, et débordait au-delà de ~12 articles. Plan :
 *  - jusqu'à 12 articles : mise en page historique inchangée (lignes de
 *    21 pt, au moins 8 lignes visibles) ;
 *  - jusqu'à 18 : une seule page, lignes resserrées à 15 pt (même police) ;
 *  - au-delà : plusieurs pages (lignes de 21 pt). Les pages suivantes
 *    reprennent l'en-tête (logo, numéro) sans les boîtes client ; totaux,
 *    CGV (ou bloc de répartition interne) uniquement sur la dernière page,
 *    qui reçoit toujours au moins une ligne d'article. "Page x/y" partout.
 * Toutes les hauteurs viennent des positions réelles du dessin ci-dessous.
 */
export interface PlanFacture {
  hauteurLigne: number;
  /** Nombre minimal de lignes dessinées (lignes vides comprises) quand la facture tient sur une page. */
  minimumLignes: number;
  /** Indices des lignes de facture, page par page. */
  pages: number[][];
}

const LIMITE_BAS_FACTURE = 740; // au-dessus de la ligne du pied de page (748.4)
const PREMIERE_LIGNE_PAGE_1 = 369.9 + DECALAGE_EN_TETE + 17.7;
/** Pages de suite : en-tête allégé (petit logo, titre, n°, client) — séparateur à cette hauteur. */
const SEPARATEUR_SUITE_Y = 104;
const TABLE_TOP_SUITE = SEPARATEUR_SUITE_Y + 12;
/** Ligne "Report de la page précédente" (pages de suite) / "Total à reporter" (bas des pages non finales). */
const HAUTEUR_REPORT = 18;
const PREMIERE_LIGNE_PAGE_SUITE = TABLE_TOP_SUITE + 17.7 + HAUTEUR_REPORT;
// Retour client du 2026-11-24 ("13 articles sur une page") : lignes de 20 pt (au lieu de 21) et
// conditions générales 4 pt plus près des totaux — 13 articles tiennent sur une page (facture payée).
const HAUTEUR_LIGNE = 20;
const ECART_TOTAUX_CGV = 72;
const HAUTEUR_FIN_DE_FACTURE = ECART_TOTAUX_CGV + 70; // totaux + bloc CGV (~70), voir plus bas
const HAUTEUR_BAS_PAGE_SUITE = HAUTEUR_REPORT + 18; // "Total à reporter" + "Suite page N…"
/** Bonne pratique (retour client du 2026-11-24) : les totaux ne partent jamais seuls sur la dernière page. */
const MIN_LIGNES_DERNIERE_PAGE = 3;

export function planifierPagesFacture(facture: Pick<Facture, "lignes" | "statutPaiement">): PlanFacture {
  const n = facture.lignes.length;
  const fin = HAUTEUR_FIN_DE_FACTURE + (facture.statutPaiement === "reservation" ? 17 : 0);
  const capacite = (premiereLigne: number, avecFin: boolean) =>
    Math.max(1, Math.floor((LIMITE_BAS_FACTURE - premiereLigne - (avecFin ? fin : HAUTEUR_BAS_PAGE_SUITE)) / HAUTEUR_LIGNE));
  const toutes = Array.from({ length: n }, (_, i) => i);
  if (n <= capacite(PREMIERE_LIGNE_PAGE_1, true)) return { hauteurLigne: HAUTEUR_LIGNE, minimumLignes: 8, pages: [toutes] };
  // 1. Chaque page remplie au maximum (jamais une page à moitié vide).
  const pages: number[][] = [];
  let i = 0;
  while (i < n) {
    const premiereLigne = pages.length === 0 ? PREMIERE_LIGNE_PAGE_1 : PREMIERE_LIGNE_PAGE_SUITE;
    const reste = n - i;
    if (reste <= capacite(premiereLigne, true)) {
      pages.push(toutes.slice(i));
      break;
    }
    const prises = Math.min(capacite(premiereLigne, false), reste - 1);
    pages.push(toutes.slice(i, i + prises));
    i += prises;
  }
  // 2. Au moins MIN_LIGNES_DERNIERE_PAGE articles avec les totaux : on ne
  //    recule que le strict nécessaire depuis la page précédente.
  const derniere = pages[pages.length - 1]!;
  const precedente = pages[pages.length - 2];
  if (precedente) {
    while (derniere.length < MIN_LIGNES_DERNIERE_PAGE && precedente.length > 1 && derniere.length < capacite(PREMIERE_LIGNE_PAGE_SUITE, true)) {
      derniere.unshift(precedente.pop()!);
    }
  }
  return { hauteurLigne: HAUTEUR_LIGNE, minimumLignes: 0, pages };
}

/** En-tête allégé des pages de suite : petit logo, titre, n° de pièce et client — plus de place pour les articles. */
function dessinerEnTeteSuite(doc: PDFKit.PDFDocument, titre: string, ligneReference: string, ligneClient: string): void {
  chargerImage(doc, assetPath("facture-filigrane.png"), 79.2, 293.9, { width: 465, height: 321 });
  chargerImage(doc, assetPath("facture-logo.jpg"), MARGE_GAUCHE, 40, { width: 140, height: 36.6 });
  doc.font("Helvetica-Bold").fontSize(15).fillColor(VERT).text(titre, 300, 42, { width: MARGE_DROITE - 300, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(8.5).fillColor(NOIR).text(ligneReference, 300, 62, { width: MARGE_DROITE - 300, align: "right", lineBreak: false });
  doc.text(ligneClient, 300, 74, { width: MARGE_DROITE - 300, align: "right", lineBreak: false, ellipsis: true });
  doc.moveTo(43.6, SEPARATEUR_SUITE_Y).lineTo(551.9, SEPARATEUR_SUITE_Y).lineWidth(1.2).strokeColor(VERT).stroke();
}

/** Ligne de report (grisée, sur toute la largeur) : libellé à gauche, montants dans leurs colonnes. */
function dessinerLigneReport(doc: PDFKit.PDFDocument, y: number, libelle: string, montants: { x: number; largeur: number; valeur: string }[]): void {
  doc.rect(45, y, 531, HAUTEUR_REPORT).fillAndStroke(FOND_BOITE, "#cccccc");
  doc.font("Helvetica-Bold").fontSize(8).fillColor(NOIR).text(libelle, 51, y + 5, { width: 300, lineBreak: false });
  for (const m of montants) doc.text(m.valeur, m.x + 3, y + 5, { width: m.largeur - 6, align: "right", lineBreak: false });
}

/** Exporté pour permettre une vérification réelle (génération d'un vrai PDF, lu visuellement) sans dépendre d'un `app.getPath` Electron — voir factureDocumentService.visuel.test.ts. Dessine toutes les pages (A4 portrait). */
export function dessinerFacture(doc: PDFKit.PDFDocument, input: FactureDocumentInput): void {
  const plan = planifierPagesFacture(input.facture);
  plan.pages.forEach((_, indexPage) => {
    if (indexPage > 0) doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    dessinerPageFacture(doc, input, plan, indexPage);
  });
}

/** Une page de la facture (voir PlanFacture) — réutilisée telle quelle par le format A4 paysage, page par page. */
export function dessinerPageFacture(
  doc: PDFKit.PDFDocument,
  { facture, identite, vendeurNomAffiche }: FactureDocumentInput,
  plan: PlanFacture,
  indexPage: number
): void {
  const premiere = indexPage === 0;
  const derniere = indexPage === plan.pages.length - 1;
  const multipage = plan.pages.length > 1;
  const finDePage = () => {
    dessinerPiedDePage(doc, identite);
    if (multipage) {
      doc.font("Helvetica").fontSize(7.5).fillColor(GRIS_LABEL).text(`Page ${indexPage + 1} / ${plan.pages.length}`, MARGE_GAUCHE, 756, {
        width: MARGE_DROITE - MARGE_GAUCHE,
        align: "right",
        lineBreak: false,
      });
    }
  };
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  // Statut affiché au client — correction "Réservation / Acompte" :
  // seul statutPaiement apparaît ici (2 valeurs : "Réservation" ou
  // "Payée"), jamais le statut de LIVRAISON, qui reste une information
  // interne à l'application (écran Factures) — décision déjà en place,
  // inchangée. Toujours régénéré à partir de l'état ACTUEL de la facture
  // (jamais figé à la création) : un changement de statut via le menu de
  // l'écran Factures se reflète automatiquement sur le prochain PDF généré.
  const mentionStatut = facture.statutPaiement === "reservation" ? "Statut : Réservation" : "Statut : Payée";
  const reference = multipage ? `${facture.numero} — page ${indexPage + 1}/${plan.pages.length}` : facture.numero;
  if (premiere) dessinerEnTeteEtIdentite(doc, identite, { titre: "FACTURE", ligneReference: reference, dateAffichee, mentionStatut });
  else dessinerEnTeteSuite(doc, "FACTURE", reference, `${facture.clientNom} — ${dateAffichee}`);

  // --- Deux boîtes : FACTURÉ À / DÉTAILS DE VENTE — décalées vers le
  // haut de DECALAGE_EN_TETE pour compenser l'en-tête raccourci (voir
  // dessinerEnTeteEtIdentite), jamais un redesign : même rythme, même
  // style, juste remonté. ---
  if (premiere) {
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
  }

  // --- Tableau ---
  // Correction "modèle de facture manuscrit fourni" (2026-10-09) : ordre
  // des colonnes et libellés repris EXACTEMENT du croquis validé par
  // l'utilisateur — QTÉ en première position, puis DESIGN/RÉF/TAILLE,
  // et nouvelle colonne M²/CTN (surface du carton, déjà calculée en
  // interne via ligne.surfaceCartonM2 mais jamais affichée jusqu'ici).
  // Largeurs recalculées pour 8 colonnes sur la même largeur totale
  // (530.5pt, bords 45.5 → 576.0 — cf. MARGE_DROITE), en conservant les
  // largeurs déjà vérifiées visuellement pour TAILLE et QTÉ (58pt) qui
  // avaient causé un retour à la ligne avant correction.
  // Correction "PRIX/M² sur deux lignes" (2026-10-22, retour utilisateur
  // visuel) : une valeur comme "15 000 FCFA" ne tenait pas sur une seule
  // ligne dans les 52pt disponibles (62pt de colonne - 10pt de marge
  // interne). Élargie à 72pt, en reprenant 6pt à DÉSIGNATION (texte fixe
  // "Cartons", jamais contraint) et 4pt à M²/CTN (valeurs courtes type
  // "0.72") — largeur totale du tableau INCHANGÉE (530.5pt), seules les
  // positions x des colonnes suivantes se décalent en conséquence.
  // Fondations quincaillerie (Phase 4) — adaptation par unité de vente,
  // voir shared-types/produit.ts (UniteVente). Deux jeux de colonnes
  // possibles, MÊMES positions/largeurs physiques dans les deux cas
  // (530.5pt, jamais une refonte de la grille) :
  //  - "mode historique" (toutes les lignes sont vendues au carton, selon
  //    `uniteVenteEffective` — donc `null`/absent TOUJOURS traité comme
  //    carton, même règle que partout ailleurs dans le projet) : libellés
  //    et calculs STRICTEMENT identiques à avant cette phase — zéro
  //    changement visuel pour toute facture 100% carreau, ancienne ou
  //    nouvelle, QUE `surfaceCartonM2` soit connu ou non pour certaines
  //    lignes (déjà géré par le "—" existant, inchangé).
  //  - "mode générique" (au moins une ligne a une unité de vente autre que
  //    carton — couvre le cas exclusivement non-carreaux ET le cas
  //    mixte) : les deux colonnes spécifiques au carton (PRIX/M²,
  //    M²/CTN) sont réaffectées à CARACTÉRISTIQUES et UNITÉ — décision
  //    validée : ne jamais supprimer systématiquement les caractéristiques
  //    des produits non-carreaux au seul motif qu'une facture contient
  //    aussi des carreaux.
  const toutesLignesCarton = facturePrincipalementAuCarton(facture);
  const colonnes = toutesLignesCarton
    ? [
        { x: 45.5, largeur: 60, titre: "QUANTITÉ" },
        { x: 105.5, largeur: 72, titre: "DÉSIGNATION" },
        { x: 177.5, largeur: 70, titre: "RÉFÉRENCE" },
        { x: 247.5, largeur: 58, titre: "TAILLE" },
        { x: 305.5, largeur: 72, titre: "PRIX/M²" },
        { x: 377.5, largeur: 40, titre: "M²/CTN" },
        { x: 417.5, largeur: 68, titre: "PRIX/CTN" },
        { x: 485.5, largeur: 90.5, titre: "TOTAL" },
      ]
    : [
        { x: 45.5, largeur: 60, titre: "QUANTITÉ" },
        { x: 105.5, largeur: 72, titre: "DÉSIGNATION" },
        { x: 177.5, largeur: 70, titre: "RÉFÉRENCE" },
        { x: 247.5, largeur: 58, titre: "TAILLE" },
        // Point 2 (2026-11-24) : colonne UNITÉ supprimée — l'unité est
        // désormais écrite dans DÉSIGNATION ("Sacs", "Pièces"…), comme
        // "Cartons" en mode historique ; sa largeur revient à CARACT.
        { x: 305.5, largeur: 112, titre: "CARACT." },
        { x: 417.5, largeur: 68, titre: "PRIX UNIT." },
        { x: 485.5, largeur: 90.5, titre: "TOTAL" },
      ];
  const tableTop = premiere ? 369.9 + DECALAGE_EN_TETE : TABLE_TOP_SUITE;
  const headerHeight = 17.7;
  const rowHeight = plan.hauteurLigne;
  // Texte vertical centré dans la ligne (6 pt pour la hauteur historique de 21 pt).
  const yTexte = Math.round((rowHeight - 9) / 2);

  doc.rect(45, tableTop, 531, headerHeight).fillAndStroke("#ffffff", "#cccccc");
  // Police réduite à 7.5 (au lieu de 9) : titres non abrégés ("DÉSIGNATION",
  // "QUANTITÉ", "RÉFÉRENCE" — décision utilisateur du 2026-10-10) plus longs
  // que les anciens libellés abrégés, à largeur de colonne inchangée.
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NOIR);
  for (const col of colonnes) {
    doc.text(col.titre, col.x + 6, tableTop + 6, { width: col.largeur - 10 });
  }

  let ligneY = tableTop + headerHeight;
  // Report (pratique comptable) : cumul des montants des pages précédentes / jusqu'à cette page.
  const montantLigne = (i: number) => facture.lignes[i]!.quantite * facture.lignes[i]!.prixUnitaire;
  const cumulAvant = plan.pages.slice(0, indexPage).flat().reduce((t, i) => t + montantLigne(i), 0);
  const cumulFin = cumulAvant + plan.pages[indexPage]!.reduce((t, i) => t + montantLigne(i), 0);
  const colonneTotal = colonnes[colonnes.length - 1]!;
  if (!premiere) {
    dessinerLigneReport(doc, ligneY, "Report de la page précédente", [{ x: colonneTotal.x, largeur: colonneTotal.largeur, valeur: `${formaterMontant(cumulAvant)} FCFA` }]);
    ligneY += HAUTEUR_REPORT;
  }
  const lignesPage = plan.pages[indexPage]!.map((i) => facture.lignes[i]!);
  // Au moins 8 lignes visibles (comme le modèle) seulement sur une facture d'une page à hauteur historique.
  const nombreLignesAffichees = Math.max(lignesPage.length, plan.pages.length === 1 ? plan.minimumLignes : 0);
  doc.font("Helvetica").fontSize(9);
  for (let i = 0; i < nombreLignesAffichees; i++) {
    const ligne = lignesPage[i];
    doc.rect(45, ligneY, 531, rowHeight).strokeColor("#cccccc").lineWidth(0.5).stroke();
    for (const col of colonnes) {
      doc
        .moveTo(col.x - 0.3, ligneY)
        .lineTo(col.x - 0.3, ligneY + rowHeight)
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .stroke();
    }
    if (ligne) {
      // Prix au m² — correction "le prix de référence est au m², ce qui
      // se vend c'est le carton" (2026-10-08) : calculé à partir du
      // prix de carton RÉELLEMENT facturé (ligne.prixUnitaire, qui peut
      // avoir été négocié) et de la surface du carton figée au moment de
      // la vente (ligne.surfaceCartonM2, jamais recalculée depuis le
      // produit actuel — voir shared-types/facture.ts). "—" si cette
      // information n'était pas disponible à l'époque de la vente.
      const estLigneCarton = uniteVenteEffective({ uniteVente: ligne.uniteVente ?? null }) === "carton";
      const prixM2 = ligne.surfaceCartonM2 !== null ? domainPricing.calculerPrixM2DepuisPrixCarton(ligne.prixUnitaire, ligne.surfaceCartonM2) : null;

      doc.fillColor(NOIR);
      doc.text(`${ligne.quantite}`, colonnes[0]!.x + 6, ligneY + yTexte, { width: colonnes[0]!.largeur - 10 });

      if (toutesLignesCarton) {
        // Mode historique — comportement STRICTEMENT inchangé (voir
        // commentaire sur `colonnes` ci-dessus). DÉSIGNATION = libellé
        // générique "Cartons", PAS le motif du carreau — l'identification
        // précise se fait via RÉFÉRENCE + TAILLE (décision utilisateur du
        // 2026-10-10 : le motif disparaît de la facture).
        doc.text("Cartons", colonnes[1]!.x + 6, ligneY + yTexte, { width: colonnes[1]!.largeur - 10 });
        doc.text(ligne.reference ?? "—", colonnes[2]!.x + 6, ligneY + yTexte, { width: colonnes[2]!.largeur - 10 });
        doc.text(ligne.taille, colonnes[3]!.x + 6, ligneY + yTexte, { width: colonnes[3]!.largeur - 10 });
        doc.text(prixM2 !== null ? `${formaterMontant(prixM2)} FCFA` : "—", colonnes[4]!.x + 6, ligneY + yTexte, { width: colonnes[4]!.largeur - 10 });
        doc.text(ligne.surfaceCartonM2 !== null ? ligne.surfaceCartonM2.toFixed(2) : "—", colonnes[5]!.x + 6, ligneY + yTexte, {
          width: colonnes[5]!.largeur - 10,
        });
      } else {
        // Mode générique (facture exclusivement non-carreaux, ou mixte) —
        // Point 2 de la liste du 2026-11-23 : DÉSIGNATION = l'unité de
        // vente au pluriel ("Sacs", "Pièces", "Cartons"…), exactement comme
        // "Cartons" en mode historique, et plus de colonne UNITÉ séparée.
        // L'identification précise se fait via RÉFÉRENCE + TAILLE, même
        // décision que pour les carreaux (2026-10-10).
        const unite = uniteVenteEffective({ uniteVente: ligne.uniteVente ?? null });
        doc.text(capitaliser(LIBELLE_UNITE_VENTE[unite].pluriel), colonnes[1]!.x + 6, ligneY + yTexte, { width: colonnes[1]!.largeur - 10 });
        doc.text(ligne.reference ?? "—", colonnes[2]!.x + 6, ligneY + yTexte, { width: colonnes[2]!.largeur - 10, height: rowHeight - 8, ellipsis: true });
        doc.text(ligne.taille, colonnes[3]!.x + 6, ligneY + yTexte, { width: colonnes[3]!.largeur - 10, height: rowHeight - 8, ellipsis: true });
        // Caractéristiques — pour une ligne carreau AU SEIN d'une facture
        // mixte, l'information commerciale essentielle (prix/m², surface
        // par carton) est préservée ici ; pour toute autre ligne, ce sont
        // ses propres caractéristiques (shared-types/caracteristiques.ts).
        const texteCaracteristiques = estLigneCarton
          ? prixM2 !== null
            ? `${formaterMontant(prixM2)} F/m² · ${ligne.surfaceCartonM2!.toFixed(2)} m²/ctn`
            : "—"
          : caracteristiquesAffichage(ligne.caracteristiques ?? null) || "—";
        doc.fontSize(7).text(texteCaracteristiques, colonnes[4]!.x + 5, ligneY + yTexte + 1, { width: colonnes[4]!.largeur - 8, height: rowHeight - 8, ellipsis: true });
        doc.fontSize(9);
      }

      doc.text(`${formaterMontant(ligne.prixUnitaire)} FCFA`, colonnes[colonnes.length - 2]!.x + 6, ligneY + yTexte, { width: colonnes[colonnes.length - 2]!.largeur - 10 });
      doc.text(`${formaterMontant(ligne.quantite * ligne.prixUnitaire)} FCFA`, colonnes[colonnes.length - 1]!.x + 6, ligneY + yTexte, {
        width: colonnes[colonnes.length - 1]!.largeur - 10,
      });
    }
    ligneY += rowHeight;
  }

  if (!derniere) {
    dessinerLigneReport(doc, ligneY, "Total à reporter", [{ x: colonneTotal.x, largeur: colonneTotal.largeur, valeur: `${formaterMontant(cumulFin)} FCFA` }]);
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRIS_LABEL).text(`Suite page ${indexPage + 2}…`, 45, ligneY + HAUTEUR_REPORT + 6, { width: 531, align: "right", lineBreak: false });
    finDePage();
    return;
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
  // Positionnement en flux (doc.y, jamais une coordonnée fixe devinée) à
  // partir du curseur réel de pdfkit — jamais de chevauchement avec le
  // pied de page, quel que soit le nombre de lignes du tableau au-dessus
  // (déjà borné à 8 minimum par nombreLignesAffichees). Correction
  // "faire descendre les CGV" (2026-10-09) : plancher à CGV_Y_MINIMUM
  // pour utiliser l'espace vide en bas de page sur une facture courte —
  // mesuré visuellement (PDF réel généré) : le bloc CGV complet mesure
  // environ 70pt de haut, donc un plancher à 655 laisse ~23pt avant la
  // ligne du pied de page (748.4), jamais un chevauchement. Sur une
  // facture longue, le flux naturel (ligneY + 76) dépasse déjà ce
  // plancher — Math.max garde alors le comportement existant.
  const CGV_Y_MINIMUM = 655;
  doc.y = Math.max(ligneY + ECART_TOTAUX_CGV + decalageCgv, CGV_Y_MINIMUM);
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

  finDePage();
}

/**
 * Format A4 paysage — DEUX EXEMPLAIRES COMPLETS de la facture A4
 * portrait officielle (`dessinerFacture`, appelée ici TELLE QUELLE,
 * jamais modifiée ni réécrite), réduits à l'échelle et placés côte à
 * côte, avec trait de découpe central (Phase 4 — correction : la
 * première version de ce format réutilisait à tort `dessinerFactureA5`,
 * une mise en page SIMPLIFIÉE et DIFFÉRENTE du document officiel
 * — retirée, voir le commentaire sur PAGE_WIDTH_A5).
 *
 * Construit DIRECTEMENT dans le PDF — jamais via une option d'impression
 * "2 pages par feuille" du pilote Windows (exigence explicite) : chaque
 * panneau est une transformation graphique PURE (`doc.save()` /
 * `doc.translate()` / `doc.scale()` / `doc.restore()`, API standard de
 * pdfkit) autour d'un appel à `dessinerFacture` — AUCUNE donnée, AUCUN
 * calcul, AUCUNE colonne n'est dupliquée ou réinventée : c'est
 * exactement le même rendu que l'A4 portrait, physiquement réduit.
 * `doc.scale()` s'applique uniformément en X ET en Y (une seule valeur
 * `echelle`), donc jamais de déformation horizontale ou verticale.
 *
 * Les deux panneaux reçoivent EXACTEMENT le même objet `input` et
 * exécutent EXACTEMENT la même fonction — ils ne peuvent donc pas
 * diverger, cette garantie découle de la construction elle-même, pas
 * d'une simple vérification visuelle.
 *
 * Pagination : ce format hérite du même comportement que `dessinerFacture`
 * qu'il réutilise tel quel — une facture à très grand nombre de lignes
 * n'est pas paginée (limitation déjà existante avant cette phase,
 * documentée ici, jamais étendue sans demande explicite).
 *
 * Piège pdfkit (ne concerne QUE ce fichier, jamais `dessinerFacture`
 * lui-même) : la pagination automatique de pdfkit (le saut de page
 * silencieux déclenché par `doc.text()` quand la position Y demandée
 * dépasse `page.maxY()`) compare une coordonnée ABSOLUE, non affectée
 * par `doc.scale()`/`doc.translate()` (ce sont de pures transformations
 * du flux graphique PDF, invisibles à cette logique de haut niveau),
 * à la hauteur RÉELLE de la page physique (`PAGE_HEIGHT_A4_PAYSAGE`,
 * plus petite que `PAGE_HEIGHT`, la hauteur pour laquelle `dessinerFacture`
 * a été écrite). Sans précaution, `dessinerFacture` croit déborder et
 * pdfkit insère des pages supplémentaires avant même que l'échelle ne
 * s'applique. Correction : agrandir temporairement `doc.page.height`
 * à `PAGE_HEIGHT` pendant l'appel (purement une donnée de calcul
 * interne à pdfkit, jamais le MediaBox déjà figé de la page réelle —
 * voir la constante `MediaBox` fixée à la création de la page), puis la
 * restaurer immédiatement après — aucune modification de `dessinerFacture`.
 */
/**
 * DOCUMENT INTERNE (retour client du 2026-11-24, illustration validée) —
 * même en-tête et mêmes boîtes que la facture, puis UN tableau : une ligne
 * par article (référence pour un carreau, nom sinon), quantité vendue,
 * quantité interne ventilée par dépôt (sous-colonnes AKANDA | AKÉBÉ…),
 * quantité extérieure, prix de vente, prix d'achat extérieur, total
 * vente, dépense et marge extérieures ; les trois totaux sur la dernière
 * page. Même pagination que la facture (même PlanFacture), pour que la
 * page N interne soit en face de la page N client en A5.
 */
export function dessinerPageDocumentInterne(
  doc: PDFKit.PDFDocument,
  { facture, identite, vendeurNomAffiche }: Pick<FactureDocumentInput, "facture" | "identite" | "vendeurNomAffiche">,
  donnees: DocumentInterneDonnees,
  plan: PlanFacture,
  indexPage: number
): void {
  const premiere = indexPage === 0;
  const derniere = indexPage === plan.pages.length - 1;
  const multipage = plan.pages.length > 1;
  const dateAffichee = new Date(facture.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const referenceInterne = `Facture liée : ${facture.numero}${multipage ? ` — page ${indexPage + 1}/${plan.pages.length}` : ""}`;
  if (premiere) {
    dessinerEnTeteEtIdentite(doc, identite, { titre: "DOCUMENT INTERNE", ligneReference: referenceInterne, dateAffichee, mentionStatut: "Usage interne — ne pas remettre au client" });
  } else {
    dessinerEnTeteSuite(doc, "DOCUMENT INTERNE", referenceInterne, `${facture.clientNom} — usage interne`);
  }

  if (premiere) {
    doc.rect(45.2, 255.5 + DECALAGE_EN_TETE, 259.4, 78.7).fill(FOND_BOITE);
    doc.rect(304.9, 255.5 + DECALAGE_EN_TETE, 259.2, 78.7).fill(FOND_BOITE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GRIS_LABEL);
    doc.text("FACTURÉ À", 55.2, 265.2 + DECALAGE_EN_TETE);
    doc.text("DÉTAILS DE VENTE", 314.7, 265.2 + DECALAGE_EN_TETE);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NOIR);
    doc.text(facture.clientNom, 55.2, 279.3 + DECALAGE_EN_TETE);
    doc.font("Helvetica").text(facture.clientTelephone ?? "—", 55.2, 291.9 + DECALAGE_EN_TETE);
    doc.text(facture.clientAdresse ?? "—", 55.2, 304.0 + DECALAGE_EN_TETE);
    doc.text(`Magasin : ${identite.nom}`, 314.7, 279.3 + DECALAGE_EN_TETE);
    doc.text(`Nombre d'articles : ${facture.lignes.length}`, 314.7, 291.9 + DECALAGE_EN_TETE);
    doc.text(`Mode de règlement : ${facture.modeReglement ?? "—"}`, 314.7, 304.0 + DECALAGE_EN_TETE);
    doc.text(`Vendeur : ${vendeurNomAffiche}`, 314.7, 316.1 + DECALAGE_EN_TETE);
  }

  // Colonnes équilibrées sur 530.5 pt — la largeur des dépôts s'adapte à leur nombre.
  const nbDepots = Math.max(1, donnees.depots.length);
  const largeurDepot = Math.min(36, (128.5 - 50) / nbDepots);
  const largeurs = [82, 46, 34, ...donnees.depots.map(() => largeurDepot), 32, 50, 50, 56, 52];
  largeurs.push(530.5 - largeurs.reduce((a, b) => a + b, 0));
  const titres = ["DÉSIGNATION / RÉF.", "TAILLE", "QTÉ VENDUE", ...donnees.depots.map((d) => d.toUpperCase()), "QTÉ EXT.", "PRIX VENTE", "PRIX ACHAT EXT.", "TOTAL VENTE", "DÉPENSE EXT.", "MARGE EXT."];
  const xs: number[] = [];
  let x = 45.5;
  for (const l of largeurs) {
    xs.push(x);
    x += l;
  }
  const iDebutDepots = 3;
  const iFinDepots = 3 + donnees.depots.length - 1;
  const iExterne = iFinDepots + 1;

  const tableTop = premiere ? 369.9 + DECALAGE_EN_TETE : TABLE_TOP_SUITE;
  const h1 = 12;
  const h2 = 16;
  doc.rect(45, tableTop, 531, h1 + h2).fillAndStroke("#ffffff", "#cccccc");
  doc.font("Helvetica-Bold").fontSize(6.6).fillColor(NOIR);
  if (donnees.depots.length > 0) {
    const debutX = xs[iDebutDepots]!;
    const finX = xs[iFinDepots]! + largeurs[iFinDepots]!;
    doc.moveTo(debutX, tableTop + h1).lineTo(finX, tableTop + h1).strokeColor("#cccccc").lineWidth(0.5).stroke();
    doc.text("QTÉ INTERNE", debutX, tableTop + 3, { width: finX - debutX, align: "center", lineBreak: false });
  }
  titres.forEach((t, i) => {
    const sousColonne = i >= iDebutDepots && i <= iFinDepots;
    doc.text(t, xs[i]! + 3, sousColonne ? tableTop + h1 + 4 : tableTop + 6, { width: largeurs[i]! - 5, align: i <= 1 ? "left" : "center" });
  });

  const rowHeight = plan.hauteurLigne;
  const yTexte = Math.round((rowHeight - 8) / 2);
  const lignesPage = plan.pages[indexPage]!.map((i) => donnees.lignes[i]).filter((l): l is LigneDocumentInterneV2 => !!l);
  const nombreLignes = Math.max(lignesPage.length, plan.pages.length === 1 ? 6 : 0);
  let ligneY = tableTop + h1 + h2;
  // Report des trois montants cumulés (total vente, dépense et marge extérieures).
  const cumul = (indices: number[]) =>
    indices.reduce(
      (t, i) => {
        const l = donnees.lignes[i];
        if (!l) return t;
        const depense = l.externe * (l.prixAchat ?? 0);
        return { vente: t.vente + l.vendu * l.prixVente, depense: t.depense + depense, marge: t.marge + l.externe * l.prixVente - depense };
      },
      { vente: 0, depense: 0, marge: 0 }
    );
  const montantsReport = (c: { vente: number; depense: number; marge: number }) =>
    [c.vente, c.depense, c.marge].map((v, k) => {
      const i = largeurs.length - 3 + k;
      return { x: xs[i]!, largeur: largeurs[i]!, valeur: formaterMontant(v) };
    });
  if (!premiere) {
    dessinerLigneReport(doc, ligneY, "Report de la page précédente", montantsReport(cumul(plan.pages.slice(0, indexPage).flat())));
    ligneY += HAUTEUR_REPORT;
  }
  for (let r = 0; r < nombreLignes; r++) {
    doc.rect(45, ligneY, 531, rowHeight).strokeColor("#cccccc").lineWidth(0.5).stroke();
    xs.forEach((cx, i) => {
      if (i > 0) doc.moveTo(cx - 0.3, ligneY).lineTo(cx - 0.3, ligneY + rowHeight).strokeColor("#cccccc").lineWidth(0.5).stroke();
    });
    const l = lignesPage[r];
    if (l) {
      const depense = l.externe * (l.prixAchat ?? 0);
      const valeurs = [
        l.designation,
        l.taille,
        String(l.vendu),
        ...l.parDepot.map((q) => (q ? String(q) : "—")),
        l.externe ? String(l.externe) : "—",
        formaterMontant(l.prixVente),
        l.prixAchat !== null ? formaterMontant(l.prixAchat) : "—",
        formaterMontant(l.vendu * l.prixVente),
        formaterMontant(depense),
        formaterMontant(l.externe * l.prixVente - depense),
      ];
      valeurs.forEach((v, i) => {
        // La quantité extérieure reste mise en évidence (couleur d'accent), jamais visible sur la facture client.
        doc.font(i === valeurs.length - 1 ? "Helvetica-Bold" : "Helvetica").fontSize(7.6).fillColor(i === iExterne && l.externe ? "#b8860b" : NOIR);
        doc.text(v, xs[i]! + 3, ligneY + yTexte, { width: largeurs[i]! - 6, align: i <= 1 ? "left" : i <= iExterne ? "center" : "right", lineBreak: false, ellipsis: true, height: 10 });
      });
    }
    ligneY += rowHeight;
  }

  const finDePage = () => {
    dessinerPiedDePage(doc, identite);
    if (multipage) {
      doc.font("Helvetica").fontSize(7.5).fillColor(GRIS_LABEL).text(`Page ${indexPage + 1} / ${plan.pages.length}`, MARGE_GAUCHE, 756, {
        width: MARGE_DROITE - MARGE_GAUCHE,
        align: "right",
        lineBreak: false,
      });
    }
  };
  if (!derniere) {
    dessinerLigneReport(doc, ligneY, "Total à reporter", montantsReport(cumul(plan.pages.slice(0, indexPage + 1).flat())));
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRIS_LABEL).text(`Suite page ${indexPage + 2}…`, 45, ligneY + HAUTEUR_REPORT + 6, { width: 531, align: "right", lineBreak: false });
    finDePage();
    return;
  }

  // Totaux (toutes les lignes, pas seulement celles de cette page). Jamais
  // appelé "bénéfice" : seule la marge sur la partie achetée à l'extérieur
  // est connue (le coût d'acquisition du stock MAXI EQUIP ne l'est pas).
  const totalVente = donnees.lignes.reduce((s2, l) => s2 + l.vendu * l.prixVente, 0);
  const depenseTotale = donnees.lignes.reduce((s2, l) => s2 + l.externe * (l.prixAchat ?? 0), 0);
  const margeTotale = donnees.lignes.reduce((s2, l) => s2 + l.externe * l.prixVente - l.externe * (l.prixAchat ?? 0), 0);
  const ry = ligneY + 16;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NOIR);
  doc.text("TOTAL DE LA VENTE", 300, ry, { width: 170 });
  doc.text(`${formaterMontant(totalVente)} FCFA`, 470, ry, { width: MARGE_DROITE - 470, align: "right" });
  doc.text("DÉPENSE EXTÉRIEURE", 300, ry + 15, { width: 170 });
  doc.text(`${formaterMontant(depenseTotale)} FCFA`, 470, ry + 15, { width: MARGE_DROITE - 470, align: "right" });
  doc.fillColor(VERT);
  doc.text("MARGE SUR ACHAT EXTÉRIEUR", 300, ry + 30, { width: 170 });
  doc.text(`${formaterMontant(margeTotale)} FCFA`, 470, ry + 30, { width: MARGE_DROITE - 470, align: "right" });
  finDePage();
}

/** Document interne seul, en A4 portrait (bouton "Document interne" de l'écran Factures) — mêmes pages que la facture. */
export async function genererDocumentInterneA4Pdf(input: Pick<FactureDocumentInput, "facture" | "identite" | "vendeurNomAffiche">, donnees: DocumentInterneDonnees): Promise<string> {
  const dossier = join(app.getPath("userData"), "documents-internes-generes");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, `${input.facture.numero}-document-interne.pdf`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);
    const plan = planifierPagesFacture(input.facture);
    plan.pages.forEach((_, indexPage) => {
      if (indexPage > 0) doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
      dessinerPageDocumentInterne(doc, input, donnees, plan, indexPage);
    });
    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}

export function dessinerFactureA4Paysage(doc: PDFKit.PDFDocument, input: FactureDocumentInput): void {
  // Échelle UNIQUE (jamais deux valeurs séparées pour X et Y, ce qui
  // déformerait le document) qui fait tenir la facture A4 PORTRAIT
  // COMPLÈTE, inchangée, dans l'espace d'un panneau — un "contain",
  // jamais un "cover" qui déborderait. Les ratios largeur/hauteur de
  // PAGE_WIDTH_A5/PAGE_HEIGHT_A5 par rapport à PAGE_WIDTH/PAGE_HEIGHT ne
  // sont pas rigoureusement identiques (arrondis ISO déjà présents dans
  // ce fichier) — le plus petit des deux garantit l'absence de
  // débordement dans les deux sens à la fois.
  const echelle = Math.min(PAGE_WIDTH_A5 / PAGE_WIDTH, PAGE_HEIGHT_A5 / PAGE_HEIGHT);
  const largeurPanneauReel = PAGE_WIDTH * echelle;
  const hauteurPanneauReelle = PAGE_HEIGHT * echelle;

  const margeExterieure = (PAGE_WIDTH_A4_PAYSAGE - 2 * PAGE_WIDTH_A5) / 2;
  // Centrage fin de la facture réduite dans l'espace de son panneau
  // (différence de quelques points entre les deux ratios ci-dessus) —
  // jamais un décalage perceptible, uniquement une précision géométrique.
  const decalageX = (PAGE_WIDTH_A5 - largeurPanneauReel) / 2;
  const decalageY = (PAGE_HEIGHT_A4_PAYSAGE - hauteurPanneauReelle) / 2;
  const xPanneau1 = margeExterieure + decalageX;
  const xPanneau2 = margeExterieure + PAGE_WIDTH_A5 + decalageX;

  // Pagination (0.12.6) : une feuille A4 paysage par page de facture — la
  // page N du client à gauche, la page N de la copie (interne ou client) à droite.
  const plan = planifierPagesFacture(input.facture);
  plan.pages.forEach((_, indexPage) => {
    if (indexPage > 0) doc.addPage({ size: [PAGE_WIDTH_A4_PAYSAGE, PAGE_HEIGHT_A4_PAYSAGE], margin: 0 });
    const hauteurPageReelle = doc.page.height;
    for (const x of [xPanneau1, xPanneau2]) {
      doc.page.height = PAGE_HEIGHT;
      doc.save();
      doc.translate(x, decalageY);
      doc.scale(echelle, echelle);
      // Panneau gauche : TOUJOURS la facture client. Panneau droit : la copie
      // interne si fournie, sinon un second exemplaire client.
      if (x === xPanneau2 && input.copieInterne) dessinerPageDocumentInterne(doc, input, input.copieInterne, plan, indexPage);
      else dessinerPageFacture(doc, input, plan, indexPage);
      doc.restore();
      doc.page.height = hauteurPageReelle;
    }

    // Trait de découpe central — pointillés, dans l'intervalle entre les
    // deux panneaux (jamais sur leur contenu), sur toute la hauteur utile.
    const xMilieu = PAGE_WIDTH_A4_PAYSAGE / 2;
    doc.save();
    doc.dash(3, { space: 2 });
    doc.moveTo(xMilieu, 8).lineTo(xMilieu, PAGE_HEIGHT_A4_PAYSAGE - 8).strokeColor("#999999").lineWidth(0.6).stroke();
    doc.undash();
    doc.restore();
  });
}
