import { useEffect, useRef, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Printer, Download, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Aperçu de document intégré à l'application, via pdfjs-dist — jamais le
 * lecteur PDF de Chromium (plusieurs tentatives basées dessus ont toutes
 * échoué : capturePage sur fenêtre cachée, fenêtre hors écran, rendu
 * offscreen+paint, ouverture directe dans une fenêtre Electron visible).
 *
 * CAUSE RÉELLE du premier échec de pdfjs-dist, identifiée en lisant le
 * code source de la bibliothèque (node_modules/pdfjs-dist/build/pdf.mjs)
 * : une page chargée via file:// a un `origin` égal à la chaîne "null"
 * (comportement documenté de Chromium). pdfjs-dist détecte ceci comme
 * "origine différente" et bascule sur un mécanisme de secours interne
 * (Worker instancié depuis un Blob contenant `await import(...)`), qui
 * nécessite que la CSP autorise `worker-src blob:` — assoupli à cet
 * effet dans windowOptions.ts. Cette piste avait été abandonnée
 * précédemment avant même d'avoir pu être retestée avec ce correctif.
 *
 * Réutilisable pour n'importe quel PDF déjà généré (facture cliente OU
 * document interne d'approvisionnement) — même fichier que celui utilisé
 * pour Imprimer/Télécharger, jamais une maquette recréée séparément.
 */
export function PdfPreviewModal({ chemin, nomSuggere, titre, onFermer }: { chemin: string; nomSuggere: string; titre: string; onFermer: () => void }) {
  const { showSuccess, showError } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageActuelle, setPageActuelle] = useState(1);
  const [nombrePages, setNombrePages] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [imprimant, setImprimant] = useState(false);
  const [telechargeant, setTelechargeant] = useState(false);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // BUG RÉEL TROUVÉ ET CORRIGÉ (diagnostic demandé, sans supposition) :
  // pageActuelle et nombrePages étaient tous deux initialisés à 1 ; pour
  // une facture MAXI EQUIP, toujours sur UNE SEULE page, le code
  // appelait ensuite setNombrePages(1)/setPageActuelle(1) — EXACTEMENT
  // les mêmes valeurs. React ne redéclenche un effet que si une valeur
  // de son tableau de dépendances a RÉELLEMENT changé (Object.is) : ici
  // rien ne changeait jamais, donc le second useEffect (celui qui
  // appelait canvas/render()) n'était JAMAIS exécuté après le chargement
  // — aucune erreur, juste un canvas jamais dessiné. Corrigé en gardant
  // TOUT le chargement + le premier rendu dans UN SEUL effet, déclenché
  // uniquement par `chemin` (qui change bien à chaque ouverture) ; la
  // navigation entre pages reste un second effet séparé, déclenché
  // seulement par un changement RÉEL de pageActuelle (2, 3, ...).
  useEffect(() => {
    let annule = false;
    void (async () => {
      setChargement(true);
      setErreur(null);
      // eslint-disable-next-line no-console
      console.log("[PDF PREVIEW] chemin reçu :", chemin);
      try {
        const lecture = await window.maxiEquip.lireDocumentBase64(chemin);
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] source reçue : success =", lecture.success, ", taille base64 =", lecture.base64?.length ?? 0, "caractères");
        if (annule) return;
        if (!lecture.success || !lecture.base64) {
          setErreur(lecture.message ?? "Impossible de charger l'aperçu.");
          return;
        }
        const octets = Uint8Array.from(atob(lecture.base64), (c) => c.charCodeAt(0));
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] début du chargement — octets décodés :", octets.length);
        const doc = await pdfjsLib.getDocument({ data: octets }).promise;
        if (annule) return;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] document chargé");
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] nombre de pages :", doc.numPages);
        docRef.current = doc;
        setNombrePages(doc.numPages);
        setPageActuelle(1);

        // Rendu de la première page effectué ICI, dans le même effet —
        // jamais délégué à un second effet dont les dépendances
        // pourraient ne pas changer de valeur (c'est précisément le bug
        // corrigé ci-dessus).
        const page = await doc.getPage(1);
        if (annule) return;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] page récupérée");
        const viewport = page.getViewport({ scale: 1.3 });
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] taille du viewport :", viewport.width, "×", viewport.height);
        const canvas = canvasRef.current;
        if (!canvas) {
          // eslint-disable-next-line no-console
          console.error("[PDF PREVIEW] ERREUR : élément <canvas> introuvable dans le DOM au moment du rendu.");
          setErreur("Erreur interne d'affichage (canvas introuvable).");
          return;
        }
        const contexte = canvas.getContext("2d");
        if (!contexte) {
          // eslint-disable-next-line no-console
          console.error("[PDF PREVIEW] ERREUR : impossible d'obtenir le contexte 2D du canvas.");
          setErreur("Erreur interne d'affichage (contexte canvas indisponible).");
          return;
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] début du rendu Canvas");
        await page.render({ canvasContext: contexte, viewport }).promise;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] rendu terminé — taille réelle du canvas :", canvas.width, "×", canvas.height);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PDF PREVIEW] ERREUR COMPLÈTE :", err);
        if (!annule) setErreur(err instanceof Error ? `Le document n'a pas pu être affiché : ${err.message}` : "Le document n'a pas pu être affiché.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [chemin]);

  // Navigation entre pages UNIQUEMENT (déclenché seulement par un
  // changement réel de pageActuelle, ex. 1 → 2 via les boutons
  // suivant/précédent — jamais par le chargement initial, géré ci-dessus).
  useEffect(() => {
    if (pageActuelle === 1 || !docRef.current || !canvasRef.current) return;
    let annule = false;
    void (async () => {
      try {
        const page = await docRef.current!.getPage(pageActuelle);
        if (annule) return;
        const viewport = page.getViewport({ scale: 1.3 });
        const canvas = canvasRef.current!;
        const contexte = canvas.getContext("2d");
        if (!contexte) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: contexte, viewport }).promise;
        // eslint-disable-next-line no-console
        console.log(`[PDF PREVIEW] page ${pageActuelle} rendue sur le canvas (${viewport.width}×${viewport.height})`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PDF PREVIEW] rendu de la page impossible :", err);
        if (!annule) setErreur("Le rendu de l'aperçu a échoué. Réessayez, ou utilisez Télécharger.");
      }
    })();
    return () => {
      annule = true;
    };
  }, [pageActuelle]);

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
          {erreur && (
            <p style={{ color: defaultTokens.colors.danger, margin: "auto", textAlign: "center", maxWidth: 380 }}>
              {erreur}
              <br />
              <span style={{ fontSize: 12, color: defaultTokens.colors.textFaint }}>Vous pouvez tout de même Imprimer ou Télécharger ci-dessus.</span>
            </p>
          )}
          {/* Le canvas reste TOUJOURS monté dans le DOM (jamais retiré
              conditionnellement) — corrige un second bug du même type
              que celui des dépendances d'effet : dessiner sur un canvas
              qui n'existe pas encore dans le DOM ne produit aucune
              erreur visible, juste un rendu qui ne s'affiche nulle part.
              Simplement masqué visuellement tant que le chargement n'est
              pas terminé ou qu'une erreur est survenue. */}
          <canvas
            ref={canvasRef}
            style={{
              display: chargement || erreur ? "none" : "block",
              maxWidth: "100%",
              height: "auto",
              boxShadow: defaultTokens.shadows.card,
              background: "#fff",
            }}
          />
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
