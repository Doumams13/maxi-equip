import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export interface LigneDocumentInterne {
  motif: string;
  taille: string;
  quantiteTotale: number;
  quantiteInterne: number;
  quantiteExterne: number;
  fournisseur: string | null;
  prixAchat: number | null;
}

function formaterMontant(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Document interne d'approvisionnement — trace la provenance réelle des
 * produits (MAXI EQUIP / fournisseur externe), jamais transmise au
 * client (§9 de la correction "Facturation"). Contrairement à la
 * facture, aucun modèle officiel n'impose sa mise en page — un document
 * simple, clair, suffit.
 */
export async function genererDocumentInternePdf(factureNumero: string, lignes: LigneDocumentInterne[]): Promise<string> {
  const dossier = join(app.getPath("userData"), "documents-internes-generes");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, `${factureNumero}-document-interne.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 45 });
    const flux = createWriteStream(chemin);
    doc.pipe(flux);

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#6ca545").text("Document interne d'approvisionnement", { align: "left" });
    doc.font("Helvetica").fontSize(10).fillColor("#666").text(`Facture liée : ${factureNumero}`, { align: "left" });
    doc.moveDown(0.3);
    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor("#999")
      .text("Document strictement interne — ne jamais transmettre au client. Le client ne voit que la quantité totale.", { align: "left" });
    doc.moveDown(1);

    for (const ligne of lignes) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a1a").text(`${ligne.motif} — ${ligne.taille}`);
      doc.font("Helvetica").fontSize(10.5).fillColor("#333");
      doc.text(`Quantité totale (facturée au client) : ${ligne.quantiteTotale}`);
      doc.text(`Provenance stock MAXI EQUIP : ${ligne.quantiteInterne}`);
      if (ligne.quantiteExterne > 0) {
        doc.fillColor("#b8860b");
        doc.text(`Provenance fournisseur externe : ${ligne.quantiteExterne}`);
        doc.text(`Fournisseur : ${ligne.fournisseur ?? "—"}`);
        doc.text(`Coût d'achat unitaire : ${ligne.prixAchat !== null ? `${formaterMontant(ligne.prixAchat)} FCFA` : "—"}`);
        doc.fillColor("#333");
      }
      doc.moveDown(1);
    }

    if (lignes.every((l) => l.quantiteExterne === 0)) {
      doc.font("Helvetica-Oblique").fontSize(11).fillColor("#666").text("Cette vente a été entièrement couverte par le stock MAXI EQUIP — aucun complément externe.");
    }

    doc.end();
    flux.on("finish", () => resolve(chemin));
    flux.on("error", reject);
  });
}
