import { useState } from "react";
import { Card, Button, Logo, defaultTokens } from "@maxi-equip/design-system";

/**
 * Écran de connexion minimal — Phase 1. Prouve que l'authentification
 * locale fonctionne réellement (identifiant + mot de passe → session),
 * pas encore l'écran final soigné (prévu en Phase 2). Fonctionne
 * entièrement hors-ligne : aucun appel réseau, uniquement l'IPC vers le
 * Main process (§8 du prompt Phase 1).
 */
export interface LoginScreenProps {
  onLoginSuccess: () => void;
}

const REASON_MESSAGES: Record<string, string> = {
  USER_NOT_FOUND: "Identifiant inconnu.",
  USER_INACTIVE: "Ce compte est désactivé.",
  WRONG_PASSWORD: "Mot de passe incorrect.",
};

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const outcome = await window.maxiEquip.login(identifiant.trim(), motDePasse);
      if (outcome.success) {
        setMotDePasse("");
        onLoginSuccess();
      } else {
        setError(REASON_MESSAGES[outcome.reason] ?? "Connexion refusée.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: defaultTokens.typography.body,
        background: defaultTokens.colors.bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Card style={{ width: 340 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Logo />
          <span style={{ fontFamily: defaultTokens.typography.display, fontSize: 17, color: defaultTokens.colors.text }}>
            MAXI EQUIP — Connexion
          </span>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: defaultTokens.colors.textSoft }}>
            Identifiant
            <input
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              autoFocus
              style={{ padding: 8, borderRadius: 6, border: `1px solid ${defaultTokens.colors.border}` }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: defaultTokens.colors.textSoft }}>
            Mot de passe
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: `1px solid ${defaultTokens.colors.border}` }}
            />
          </label>
          {error && <p style={{ color: defaultTokens.colors.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          <Button type="submit">{loading ? "Connexion…" : "Se connecter"}</Button>
        </form>
      </Card>
    </div>
  );
}
