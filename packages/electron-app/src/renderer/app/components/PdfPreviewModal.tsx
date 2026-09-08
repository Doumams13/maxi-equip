import { useEffect, useRef, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Printer, Download, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Aperçu de document intégré à l'application — correction
 * "Voir/Imprimer/Télécharger" §1 : "l'utilisateur doit pouvoir consulter
 * la facture depuis MAXI EQUIP", jamais un lecteur externe (Adobe
 * Reader, Edge, etc.), jamais shell.openPath.
 *
 * Rendu via pdfjs-dist directement sur un <canvas> — fonctionne de façon
 * fiable quelle que soit la configuration du poste (contrairement à un
 * <iframe src="fichier.pdf">, qui dépend du plugin PDF de Chromium),
 * jamais de dépendance à un lecteur externe.
 *
 * Réutilisable pour n'importe quel PDF déjà généré (facture cliente OU
 * document interne d'approvisionnement, §4/§6 de la correction) — la
 * logique d'aperçu/impression/enregistrement ne doit jamais être
 * dupliquée entre les deux.
 */
export function PdfPreviewModal({ chemin, nomSuggere, titre, onFermer }: { chemin: string; nomSuggere: string; titre: string; onFermer: () => void }) {
  const { showSuccess, showError } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageActuelle, setPageActuelle] = useState(1);
  const [nombrePages, setNombrePages] = useState(1);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [imprimant, setImprimant] = useState(false);
  const [telechargeant, setTelechargeant] = useState(false);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      setChargement(true);
      setErreur(null);
      const lecture = await window.maxiEquip.lireDocumentBase64(chemin);
      if (annule) return;
      if (!lecture.success || !lecture.base64) {
        setErreur(lecture.message ?? "Impossible de charger l'aperçu.");
        setChargement(false);
        return;
      }
      try {
        const octets = Uint8Array.from(atob(lecture.base64), (c) => c.charCodeAt(0));
        const doc = await pdfjsLib.getDocument({ data: octets }).promise;
        if (annule) return;
        docRef.current = doc;
        setNombrePages(doc.numPages);
        setPageActuelle(1);
      } catch {
        if (!annule) setErreur("Le document n'a pas pu être affiché.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [chemin]);

  useEffect(() => {
    if (!docRef.current || !canvasRef.current) return;
    let annule = false;
    void (async () => {
      const page = await docRef.current!.getPage(pageActuelle);
      if (annule) return;
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = canvasRef.current!;
      const contexte = canvas.getContext("2d");
      if (!contexte) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: contexte, viewport }).promise;
    })();
    return () => {
      annule = true;
    };
  }, [pageActuelle, nombrePages]);

  async function handleImprimer() {
    setImprimant(true);
    try {
      const result = await window.maxiEquip.imprimerDocument(chemin);
      if (!result.success && result.message) showError("Impression annulée", result.message);
    } finally {
      setImprimant(false);
    }
  }

  async function handleTelecharger() {
    setTelechargeant(true);
    try {
      const result = await window.maxiEquip.telechargerDocument(chemin, nomSuggere);
      if (result.success) showSuccess("Document enregistré", `Enregistré sous ${result.chemin}`);
      else if (!result.canceled) showError("Enregistrement impossible", result.message ?? "Une erreur inattendue s'est produite.");
    } finally {
      setTelechargeant(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <Card elevated style={{ width: "min(720px, 94vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16.5 }}>{titre}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Button variant="ghost" onClick={() => void handleImprimer()} loading={imprimant} title="Imprimer">
              <Printer size={16} />
            </Button>
            <Button variant="ghost" onClick={() => void handleTelecharger()} loading={telechargeant} title="Télécharger">
              <Download size={16} />
            </Button>
            <button onClick={onFermer} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Fermer">
              <X size={18} color={defaultTokens.colors.textFaint} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", background: defaultTokens.colors.surfaceAlt, borderRadius: defaultTokens.radius.md, display: "flex", justifyContent: "center", padding: 16 }}>
          {chargement && <p style={{ color: defaultTokens.colors.textSoft, margin: "auto" }}>Chargement de l'aperçu…</p>}
          {erreur && <p style={{ color: defaultTokens.colors.danger, margin: "auto" }}>{erreur}</p>}
          {!chargement && !erreur && <canvas ref={canvasRef} style={{ boxShadow: defaultTokens.shadows.card, background: "#fff" }} />}
        </div>

        {nombrePages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 12, flexShrink: 0 }}>
            <Button variant="ghost" onClick={() => setPageActuelle((p) => Math.max(1, p - 1))} disabled={pageActuelle <= 1}>
              <ChevronLeft size={14} />
            </Button>
            <span style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
              Page {pageActuelle} sur {nombrePages}
            </span>
            <Button variant="ghost" onClick={() => setPageActuelle((p) => Math.min(nombrePages, p + 1))} disabled={pageActuelle >= nombrePages}>
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
