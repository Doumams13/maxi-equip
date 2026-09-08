import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Printer, Download } from "lucide-react";

/**
 * Aperçu de document intégré à l'application — correction
 * "Voir/Imprimer/Télécharger", puis "Aperçus vides" : la première
 * implémentation (pdfjs-dist, rendu sur <canvas>) restait blanche sans
 * qu'aucune erreur exploitable ne remonte, malgré une CSP assouplie —
 * cause exacte non identifiable sans pouvoir exécuter Electron pour
 * déboguer en conditions réelles.
 *
 * Remplacée par une approche plus fiable : capture d'écran de la MÊME
 * fenêtre cachée (plugins: true) que celle utilisée pour Imprimer,
 * fonctionnalité déjà confirmée opérationnelle. Une seule et même source
 * de document sert donc à Voir, Imprimer et Télécharger — jamais une
 * maquette recréée séparément.
 *
 * Réutilisable pour n'importe quel PDF déjà généré (facture cliente OU
 * document interne d'approvisionnement).
 */
export function PdfPreviewModal({ chemin, nomSuggere, titre, onFermer }: { chemin: string; nomSuggere: string; titre: string; onFermer: () => void }) {
  const { showSuccess, showError } = useToast();
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [imprimant, setImprimant] = useState(false);
  const [telechargeant, setTelechargeant] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      setChargement(true);
      setErreur(null);
      try {
        const result = await window.maxiEquip.genererApercuImage(chemin);
        if (annule) return;
        // eslint-disable-next-line no-console
        console.log(`[apercu-renderer] réponse reçue : success=${result.success}, taille base64=${result.base64?.length ?? 0} caractères`);
        if (result.success && result.base64) {
          setImageBase64(result.base64);
        } else {
          setErreur(result.message ?? "Impossible de générer l'aperçu.");
        }
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [chemin]);

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
          {!chargement && !erreur && imageBase64 && (
            <img src={`data:image/png;base64,${imageBase64}`} alt={titre} style={{ maxWidth: "100%", boxShadow: defaultTokens.shadows.card, background: "#fff" }} />
          )}
        </div>
      </Card>
    </div>
  );
}
