import { X, AlertTriangle } from "lucide-react";
import { Card } from "./Card.js";
import { Button } from "./Button.js";
import { defaultTokens } from "../tokens.js";

export interface ConfirmDialogRow {
  label: string;
  value: string;
}

export interface ConfirmDialogProps {
  title: string;
  /** Résumé clair de l'opération à confirmer (§10 de la correction : "afficher un résumé"). */
  resume: ConfirmDialogRow[];
  onAnnuler: () => void;
  onConfirmer: () => void;
  /** true pendant l'exécution réelle — désactive le bouton pour empêcher une double soumission (§22). */
  confirming?: boolean;
  confirmLabel?: string;
  /** Rouge/avertissement pour les opérations destructrices (suppression). */
  danger?: boolean;
}

/**
 * Modale de confirmation réutilisable du Design System — remplace tout
 * usage de `window.confirm()` (§21 de la correction : "privilégier une
 * vraie modale de confirmation propre, cohérente avec l'interface MAXI
 * EQUIP"). Utilisée pour toute opération qui modifie réellement les
 * données : création/modification/suppression de produit, entrée de
 * stock, transfert, vente.
 *
 * Protection anti-double-soumission intégrée : le bouton de confirmation
 * se désactive dès que `confirming` est vrai, jusqu'à ce que l'appelant
 * le repasse à false (opération terminée) — deux clics rapides ne
 * peuvent donc jamais déclencher l'action deux fois.
 */
export function ConfirmDialog({ title, resume, onAnnuler, onConfirmer, confirming = false, confirmLabel = "Confirmer", danger = false }: ConfirmDialogProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !confirming) onAnnuler();
      }}
    >
      <Card elevated style={{ width: "min(460px, 92vw)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {danger && <AlertTriangle size={18} color={defaultTokens.colors.danger} />}
            <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16.5, color: danger ? defaultTokens.colors.danger : defaultTokens.colors.text }}>{title}</h2>
          </div>
          <button onClick={onAnnuler} disabled={confirming} style={{ background: "none", border: "none", cursor: confirming ? "not-allowed" : "pointer", padding: 4 }} aria-label="Fermer">
            <X size={17} color={defaultTokens.colors.textFaint} />
          </button>
        </div>

        <div style={{ border: `1px solid ${defaultTokens.colors.borderSoft}`, borderRadius: defaultTokens.radius.md, overflow: "hidden", marginBottom: 18 }}>
          {resume.map((r, i) => (
            <div
              key={i}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 14px", fontSize: 13, borderTop: i > 0 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none" }}
            >
              <span style={{ color: defaultTokens.colors.textSoft }}>{r.label}</span>
              <span style={{ fontWeight: 700, color: defaultTokens.colors.text, textAlign: "right" }}>{r.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onAnnuler} disabled={confirming} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirmer} loading={confirming} style={{ flex: 1 }}>
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
