import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Card, Button, Logo, defaultTokens, useToast } from "@maxi-equip/design-system";
import { User, Lock, Eye, EyeOff, LogIn, Power } from "lucide-react";
import { DecorativeBackground } from "./DecorativeBackground.js";
import { mapAuthFailureReason, mapUnexpectedError, FIELD_REQUIRED_MESSAGES } from "./errorMessages.js";
import logoUrl from "./assets/maxi-equip-logo.png";

/**
 * Écran de connexion — Phase 1 (finalisation UI + notifications). Reproduit
 * la maquette officielle fournie par MAXI EQUIP. La logique
 * d'authentification est STRICTEMENT INCHANGÉE : seule la présentation du
 * résultat change — les erreurs techniques ne sont plus jamais affichées
 * directement, elles passent systématiquement par la couche de traduction
 * (errorMessages.ts) puis par le système de notifications (Toast).
 */
export interface LoginScreenProps {
  onLoginSuccess: () => void;
}

function fieldStyle(hasError: boolean, focused: boolean): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 14px 11px 40px",
    borderRadius: defaultTokens.radius.sm,
    border: `1px solid ${hasError ? defaultTokens.colors.danger : focused ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
    boxShadow: focused ? defaultTokens.shadows.focusRing : "none",
    fontFamily: defaultTokens.typography.body,
    fontSize: 14,
    color: defaultTokens.colors.text,
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  };
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const { showSuccess, showError, showWarning } = useToast();

  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [identifiantHasError, setIdentifiantHasError] = useState(false);
  const [motDePasseHasError, setMotDePasseHasError] = useState(false);
  const [focusedField, setFocusedField] = useState<"identifiant" | "motDePasse" | null>(null);

  const identifiantRef = useRef<HTMLInputElement>(null);
  const motDePasseRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIdentifiantHasError(false);
    setMotDePasseHasError(false);

    // Validation des champs AVANT tout appel à l'authentification (§10) —
    // ne modifie pas la logique métier, empêche seulement un appel inutile.
    if (identifiant.trim().length === 0) {
      const { title, message } = FIELD_REQUIRED_MESSAGES.identifiant;
      showWarning(title, message);
      setIdentifiantHasError(true);
      identifiantRef.current?.focus();
      return;
    }
    if (motDePasse.length === 0) {
      const { title, message } = FIELD_REQUIRED_MESSAGES.motDePasse;
      showWarning(title, message);
      setMotDePasseHasError(true);
      motDePasseRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const outcome = await window.maxiEquip.login(identifiant.trim(), motDePasse);
      if (outcome.success) {
        setMotDePasse("");
        showSuccess("Connexion réussie", `Bienvenue, ${outcome.session.nom}.`);
        onLoginSuccess();
      } else {
        // outcome.reason est un motif métier connu (retour normal du
        // domaine, jamais une exception) — traduit en message utilisateur,
        // jamais affiché tel quel.
        const { title, message } = mapAuthFailureReason(outcome.reason);
        showError(title, message);
        setIdentifiantHasError(true);
        setMotDePasseHasError(true);
      }
    } catch (err) {
      // Erreur technique inattendue (IPC/Electron/Node) — journalisée en
      // détail dans la console développeur (mapUnexpectedError), jamais
      // affichée telle quelle à l'utilisateur.
      const { title, message } = mapUnexpectedError(err);
      showError(title, message);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuit() {
    await window.maxiEquip.quit();
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: defaultTokens.colors.bg,
        fontFamily: defaultTokens.typography.body,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <DecorativeBackground />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 420, width: "100%" }}>
        {/* Logo + identité — logo officiel utilisé tel quel, jamais modifié */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <Logo logoUrl={logoUrl} width={96} height={70} />
          <h1
            style={{
              margin: "10px 0 2px",
              fontFamily: defaultTokens.typography.display,
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: "0.02em",
              color: defaultTokens.colors.accent,
            }}
          >
            MAXI EQUIP
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: defaultTokens.typography.body,
              fontSize: 12.5,
              color: defaultTokens.colors.textSoft,
              textAlign: "center",
            }}
          >
            Quincaillerie · Vente de matériaux de construction
          </p>
          <div style={{ width: 46, height: 2, background: defaultTokens.colors.accent, marginTop: 8, borderRadius: 2 }} />
        </div>

        {/* Carte de connexion */}
        <Card elevated padding={28} style={{ width: "100%", boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: 21, color: defaultTokens.colors.text }}>
              Connexion
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>Accédez à votre espace MAXI EQUIP</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label
                htmlFor="login-identifiant"
                style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}
              >
                Identifiant
              </label>
              <div style={{ position: "relative" }}>
                <User
                  size={16}
                  color={defaultTokens.colors.textFaint}
                  style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  id="login-identifiant"
                  ref={identifiantRef}
                  value={identifiant}
                  onChange={(e) => {
                    setIdentifiant(e.target.value);
                    setIdentifiantHasError(false);
                  }}
                  onFocus={() => setFocusedField("identifiant")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Votre identifiant"
                  autoFocus
                  autoComplete="username"
                  style={fieldStyle(identifiantHasError, focusedField === "identifiant")}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-mot-de-passe"
                style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}
              >
                Mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  color={defaultTokens.colors.textFaint}
                  style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  id="login-mot-de-passe"
                  ref={motDePasseRef}
                  type={showPassword ? "text" : "password"}
                  value={motDePasse}
                  onChange={(e) => {
                    setMotDePasse(e.target.value);
                    setMotDePasseHasError(false);
                  }}
                  onFocus={() => setFocusedField("motDePasse")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                  style={{ ...fieldStyle(motDePasseHasError, focusedField === "motDePasse"), paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    padding: 4,
                  }}
                >
                  {showPassword ? (
                    <EyeOff size={16} color={defaultTokens.colors.textFaint} />
                  ) : (
                    <Eye size={16} color={defaultTokens.colors.textFaint} />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 4 }}>
              <LogIn size={16} />
              {loading ? "Connexion…" : "Se connecter"}
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
              <div style={{ flex: 1, height: 1, background: defaultTokens.colors.borderSoft }} />
              <span style={{ fontSize: 11.5, color: defaultTokens.colors.textFaint }}>ou</span>
              <div style={{ flex: 1, height: 1, background: defaultTokens.colors.borderSoft }} />
            </div>

            <Button type="button" variant="secondary" onClick={() => void handleQuit()} style={{ width: "100%" }}>
              <Power size={16} />
              Quitter l'application
            </Button>
          </form>
        </Card>
      </div>

      <span
        style={{
          position: "absolute",
          bottom: 12,
          right: 16,
          fontSize: 11,
          color: defaultTokens.colors.textFaint,
          zIndex: 1,
        }}
      >
        v1.0.0
      </span>
    </div>
  );
}
