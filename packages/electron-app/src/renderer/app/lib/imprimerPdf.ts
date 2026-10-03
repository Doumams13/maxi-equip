import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const ID_CONTENEUR = "zone-impression-pdf";
/** Échelle de rendu pour l'impression — nettement plus élevée que l'aperçu écran (PdfPreviewModal), pour un texte net sur papier. */
const ECHELLE_IMPRESSION = 3;

/**
 * Impression — remplace l'ancienne approche (fenêtre Electron cachée
 * chargeant le PDF via le lecteur intégré de Chromium, `documents:imprimer`
 * côté Main, retiré). Cette approche échouait pour la même raison déjà
 * rencontrée et corrigée une fois pour "Voir" (voir ipc/metier.ts) : le
 * lecteur PDF intégré de Chromium ne fournit pas d'aperçu à la boîte de
 * dialogue d'impression Windows ("cette application ne prend pas en
 * charge l'aperçu avant impression").
 *
 * Solution : rendre le PDF avec pdf.js (déjà utilisé et fiable pour
 * l'aperçu dans l'app, voir PdfPreviewModal.tsx) sur des <canvas> réels,
 * puis déclencher `window.print()` sur ce contenu DOM normal — jamais
 * sur le PDF lui-même. Chromium sait parfaitement prévisualiser et
 * imprimer du contenu DOM classique ; seul le lecteur PDF intégré posait
 * problème.
 *
 * Chaque page est dimensionnée en mm à sa taille RÉELLE (dérivée des
 * points PDF, 1pt = 1/72 pouce) — jamais une taille écran approximative —
 * pour que le papier imprimé corresponde exactement à la mise en page
 * d'origine (voir factureDocumentService.ts, format proche A4).
 */
export async function imprimerPdf(chemin: string): Promise<{ success: boolean; message?: string }> {
  const lecture = await window.maxiEquip.lireDocumentBase64(chemin);
  if (!lecture.success || !lecture.base64) {
    return { success: false, message: lecture.message ?? "Impossible de charger le document à imprimer." };
  }

  let conteneur: HTMLDivElement | null = null;
  let style: HTMLStyleElement | null = null;

  try {
    const octets = Uint8Array.from(atob(lecture.base64), (c) => c.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data: octets }).promise;

    conteneur = document.createElement("div");
    conteneur.id = ID_CONTENEUR;

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewportImpression = page.getViewport({ scale: ECHELLE_IMPRESSION });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewportImpression.width);
      canvas.height = Math.floor(viewportImpression.height);
      const contexte = canvas.getContext("2d");
      if (!contexte) throw new Error("Contexte canvas indisponible.");
      await page.render({ canvasContext: contexte, viewport: viewportImpression }).promise;

      // Taille physique réelle (échelle 1 = points PDF natifs), jamais la
      // taille du canvas ci-dessus qui dépend de ECHELLE_IMPRESSION.
      const viewportBase = page.getViewport({ scale: 1 });
      const largeurMm = (viewportBase.width / 72) * 25.4;
      const hauteurMm = (viewportBase.height / 72) * 25.4;

      const pageDiv = document.createElement("div");
      pageDiv.className = "page-impression";
      pageDiv.style.width = `${largeurMm}mm`;
      pageDiv.style.height = `${hauteurMm}mm`;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      pageDiv.appendChild(canvas);
      conteneur.appendChild(pageDiv);
    }

    // Styles injectés localement (ce projet n'a aucun fichier CSS global,
    // uniquement des styles en ligne) — retirés avec le conteneur juste
    // après l'impression, jamais laissés dans le DOM.
    style = document.createElement("style");
    style.textContent = `
      @media print {
        body > *:not(#${ID_CONTENEUR}) { display: none !important; }
        #${ID_CONTENEUR} { position: absolute; top: 0; left: 0; width: 100%; }
        .page-impression { break-after: page; }
        .page-impression:last-child { break-after: auto; }
        @page { margin: 0; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(conteneur);

    await new Promise<void>((resolve) => {
      const onAfterPrint = () => {
        window.removeEventListener("afterprint", onAfterPrint);
        resolve();
      };
      window.addEventListener("afterprint", onAfterPrint);
      window.print();
    });

    return { success: true };
  } catch (err) {
    return { success: false, message: err instanceof Error ? `L'impression a échoué : ${err.message}` : "L'impression a échoué." };
  } finally {
    conteneur?.remove();
    style?.remove();
  }
}
