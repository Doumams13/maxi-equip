import { useState } from "react";
import { Card, Button, defaultTokens } from "@maxi-equip/design-system";
import { Lock } from "lucide-react";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Double validation par mot de passe — demandée pour l'enregistrement
 * des Paramètres ("ce sont des données sensibles"). Ne modifie jamais la
 * session en cours (voir authService.verifierMotDePasseActuel côté
 * Main) : uniquement une vérification, jamais une reconnexion.
 */
export function ConfirmationMotDePasse({ titre, message, onAnnuler, onConfirme }: { titre: string; message: string; onAnnuler: () => void; onConfirme: () => void }) {
  const [motDePasse, setMotDePasse] = useState("");
  const [verification, setVerification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleValider() {
    if (!motDePasse) {
      setErreur("Veuillez saisir votre mot de passe.");
      return;
    }
    setVerification(true);
    setErreur(null);
    try {
      const result = await window.maxiEquip.verifierMotDePasse(motDePasse);
      if (result.valide) {
        onConfirme();
      } else {
        setErreur("Mot de passe incorrect.");
      }
    } finally {
      setVerification(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
      <Card elevated style={{ width: "min(420px, 92vw)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Lock size={16} color={defaultTokens.colors.accent} />
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>{titre}</h2>
        </div>
        <p style={{ margin: "8px 0 14px", fontSize: 13, color: defaultTokens.colors.textSoft }}>{message}</p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Votre mot de passe</label>
        <input
          type="password"
          style={{ ...inputStyle, borderColor: erreur ? defaultTokens.colors.danger : defaultTokens.colors.border }}
          value={motDePasse}
          onChange={(e) => {
            setMotDePasse(e.target.value);
            setErreur(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleValider();
          }}
          autoFocus
        />
        {erreur && <p style={{ margin: "6px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreur}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Button variant="secondary" onClick={onAnnuler} disabled={verification} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button onClick={() => void handleValider()} loading={verification} style={{ flex: 1 }}>
            Confirmer
          </Button>
        </div>
      </Card>
    </div>
  );
}
