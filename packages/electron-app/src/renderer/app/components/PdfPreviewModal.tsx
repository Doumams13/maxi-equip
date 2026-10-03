import { useEffect, useRef, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Printer, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, StretchHorizontal, RectangleVertical } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { imprimerPdf } from "../lib/imprimerPdf.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const ECHELLE_MIN = 0.5;
const ECHELLE_MAX = 3;
const ECHELLE_PAR_DEFAUT = 1.6;
const PAS_ZOOM = 0.2;

/**
 * Aperçu de document intégré à l'application, via pdfjs-dist. Historique
 * complet dans les commits précédents (plusieurs approches basées sur le
 * lecteur PDF de Chromium ont échoué ; deux bugs React réels ont ensuite
 * empêché le rendu de s'exécuter ; la netteté a été corrigée avec le
 * devicePixelRatio). Cette version ajoute les contrôles de zoom demandés
 * — architecture de rendu consolidée pour rester fiable en ajoutant ce
 * nouveau paramètre (l'échelle) sans réintroduire le bug des dépendances
 * de useEffect qui ne changent jamais de valeur.
 *
 * Réutilisable pour n'importe quel PDF déjà généré (facture cliente OU
 * document interne d'approvisionnement) — même fichier que celui utilisé
 * pour Imprimer/Télécharger, jamais une maquette recréée séparément.
 */
export function PdfPreviewModal({ chemin, nomSuggere, titre, onFermer }: { chemin: string; nomSuggere: string; titre: string; onFermer: () => void }) {
  const { showSuccess, showError } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const conteneurRef = useRef<HTMLDivElement>(null);
  const [pageActuelle, setPageActuelle] = useState(1);
  const [nombrePages, setNombrePages] = useState(0);
  const [echelle, setEchelle] = useState(ECHELLE_PAR_DEFAUT);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [imprimant, setImprimant] = useState(false);
  const [telechargeant, setTelechargeant] = useState(false);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [docPret, setDocPret] = useState(false);
  const [pourcentageSaisi, setPourcentageSaisi] = useState(String(Math.round((ECHELLE_PAR_DEFAUT / ECHELLE_PAR_DEFAUT) * 100)));

  useEffect(() => {
    let annule = false;
    docRef.current = null;
    setDocPret(false);
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
        console.log("[PDF PREVIEW] document chargé, nombre de pages :", doc.numPages);
        docRef.current = doc;
        setNombrePages(doc.numPages);
        setPageActuelle(1);
        setEchelle(ECHELLE_PAR_DEFAUT);
        setDocPret(true);
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

  useEffect(() => {
    if (!docPret || !docRef.current || !canvasRef.current) return;
    let annule = false;
    void (async () => {
      try {
        const page = await docRef.current!.getPage(pageActuelle);
        if (annule) return;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] page récupérée, échelle :", echelle);
        const ratioEcran = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: echelle });
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] taille du viewport :", viewport.width, "×", viewport.height);
        const canvas = canvasRef.current!;
        const contexte = canvas.getContext("2d");
        if (!contexte) {
          // eslint-disable-next-line no-console
          console.error("[PDF PREVIEW] ERREUR : impossible d'obtenir le contexte 2D du canvas.");
          setErreur("Erreur interne d'affichage (contexte canvas indisponible).");
          return;
        }
        canvas.width = Math.floor(viewport.width * ratioEcran);
        canvas.height = Math.floor(viewport.height * ratioEcran);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] début du rendu Canvas");
        await page.render({
          canvasContext: contexte,
          viewport,
          transform: ratioEcran !== 1 ? [ratioEcran, 0, 0, ratioEcran, 0, 0] : undefined,
        }).promise;
        // eslint-disable-next-line no-console
        console.log("[PDF PREVIEW] rendu terminé — taille réelle du canvas :", canvas.width, "×", canvas.height);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PDF PREVIEW] rendu de la page impossible :", err);
        if (!annule) setErreur("Le rendu de l'aperçu a échoué. Réessayez, ou utilisez Télécharger.");
      }
    })();
    return () => {
      annule = true;
    };
  }, [docPret, pageActuelle, echelle]);

  // Synchronise le champ de saisie du pourcentage avec l'échelle réelle,
  // quelle que soit sa source (boutons +/-, Largeur, Page, ou une
  // validation de saisie manuelle) — jamais pendant la frappe elle-même,
  // qui ne modifie qu'un état local séparé (pourcentageSaisi) tant que
  // l'utilisateur n'a pas validé.
  useEffect(() => {
    setPourcentageSaisi(String(Math.round((echelle / ECHELLE_PAR_DEFAUT) * 100)));
  }, [echelle]);

  /** Applique un pourcentage saisi manuellement — corrige aussi le problème signalé : impossible de revenir exactement à 100% via +/- après Largeur/Page. */
  function appliquerPourcentageSaisi() {
    const valeur = parseInt(pourcentageSaisi, 10);
    if (Number.isNaN(valeur)) {
      setPourcentageSaisi(String(Math.round((echelle / ECHELLE_PAR_DEFAUT) * 100)));
      return;
    }
    const pourcentageClamp = Math.max((ECHELLE_MIN / ECHELLE_PAR_DEFAUT) * 100, Math.min((ECHELLE_MAX / ECHELLE_PAR_DEFAUT) * 100, valeur));
    setEchelle((pourcentageClamp / 100) * ECHELLE_PAR_DEFAUT);
  }

  function zoomAvant() {
    setEchelle((e) => Math.min(ECHELLE_MAX, +(e + PAS_ZOOM).toFixed(2)));
  }

  function zoomArriere() {
    setEchelle((e) => Math.max(ECHELLE_MIN, +(e - PAS_ZOOM).toFixed(2)));
  }

  async function ajusterALaLargeur() {
    if (!docRef.current || !conteneurRef.current) return;
    const page = await docRef.current.getPage(pageActuelle);
    const largeurIntrinseque = page.getViewport({ scale: 1 }).width;
    const largeurDisponible = conteneurRef.current.clientWidth - 32;
    setEchelle(Math.max(ECHELLE_MIN, Math.min(ECHELLE_MAX, largeurDisponible / largeurIntrinseque)));
  }

  async function ajusterALaPage() {
    if (!docRef.current || !conteneurRef.current) return;
    const page = await docRef.current.getPage(pageActuelle);
    const viewportBase = page.getViewport({ scale: 1 });
    const largeurDisponible = conteneurRef.current.clientWidth - 32;
    const hauteurDisponible = conteneurRef.current.clientHeight - 32;
    const echelleCalculee = Math.min(largeurDisponible / viewportBase.width, hauteurDisponible / viewportBase.height);
    setEchelle(Math.max(ECHELLE_MIN, Math.min(ECHELLE_MAX, echelleCalculee)));
  }

  async function handleImprimer() {
    setImprimant(true);
    try {
      const result = await imprimerPdf(chemin);
      if (!result.success && result.message) showError("Impression impossible", result.message);
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

  const zoomDesactive = chargement || !!erreur;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <Card elevated style={{ width: "min(760px, 94vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "6px 8px",
            marginBottom: 10,
            background: defaultTokens.colors.surfaceAlt,
            borderRadius: defaultTokens.radius.sm,
            flexShrink: 0,
          }}
        >
          <Button variant="ghost" onClick={zoomArriere} disabled={zoomDesactive || echelle <= ECHELLE_MIN} title="Zoom arrière">
            <ZoomOut size={15} />
          </Button>
          <span style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
            <input
              type="text"
              inputMode="numeric"
              value={pourcentageSaisi}
              onChange={(e) => setPourcentageSaisi(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={appliquerPourcentageSaisi}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              disabled={zoomDesactive}
              title="Saisir un pourcentage de zoom précis"
              style={{
                width: 40,
                textAlign: "center",
                border: `1px solid ${defaultTokens.colors.border}`,
                borderRadius: defaultTokens.radius.sm,
                padding: "3px 2px",
                fontSize: 12.5,
                fontFamily: "inherit",
                color: defaultTokens.colors.textSoft,
              }}
            />
            %
          </span>
          <Button variant="ghost" onClick={zoomAvant} disabled={zoomDesactive || echelle >= ECHELLE_MAX} title="Zoom avant">
            <ZoomIn size={15} />
          </Button>
          <div style={{ width: 1, height: 20, background: defaultTokens.colors.borderSoft, margin: "0 4px" }} />
          <Button variant="ghost" onClick={() => void ajusterALaLargeur()} disabled={zoomDesactive} title="Ajuster à la largeur">
            <StretchHorizontal size={15} />
            <span style={{ fontSize: 12.5 }}>Largeur</span>
          </Button>
          <Button variant="ghost" onClick={() => void ajusterALaPage()} disabled={zoomDesactive} title="Ajuster à la page">
            <RectangleVertical size={15} />
            <span style={{ fontSize: 12.5 }}>Page</span>
          </Button>
        </div>

        <div
          ref={conteneurRef}
          style={{ flex: 1, overflow: "auto", background: defaultTokens.colors.surfaceAlt, borderRadius: defaultTokens.radius.md, padding: 16 }}
        >
          {/* BUG CORRIGÉ (signalé : "une partie de la facture n'est pas
              visible même en scrollant") : "display:flex,
              justifyContent:center" empêchait d'atteindre le DÉBUT du
              contenu en scrollant dès que le canvas dépassait la largeur
              du conteneur — comportement documenté de la combinaison
              flexbox+centrage+débordement. Remplacé par un centrage par
              bloc classique (margin:auto), qui reste défilable
              correctement dans les deux sens quel que soit le zoom. */}
          {chargement && <p style={{ color: defaultTokens.colors.textSoft, textAlign: "center", marginTop: 60 }}>Chargement de l'aperçu…</p>}
          {erreur && (
            <p style={{ color: defaultTokens.colors.danger, textAlign: "center", maxWidth: 380, margin: "60px auto" }}>
              {erreur}
              <br />
              <span style={{ fontSize: 12, color: defaultTokens.colors.textFaint }}>Vous pouvez tout de même Imprimer ou Télécharger ci-dessus.</span>
            </p>
          )}
          <canvas
            ref={canvasRef}
            style={{
              display: chargement || erreur ? "none" : "block",
              boxShadow: defaultTokens.shadows.card,
              background: "#fff",
              margin: "0 auto",
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
