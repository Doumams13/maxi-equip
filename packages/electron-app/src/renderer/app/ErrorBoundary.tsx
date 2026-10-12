import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card, Button, defaultTokens } from "@maxi-equip/design-system";
import { AlertTriangle } from "lucide-react";

/**
 * Correction "écran blanc fréquent, nécessite de relancer l'appli"
 * (2026-10-10) — le symptôme rapporté par un client venait d'une absence
 * totale de limite d'erreur React : la moindre exception pendant un rendu,
 * où que ce soit dans l'arbre, faisait démonter TOUT le contenu (comportement
 * par défaut de React), laissant un `<div id="root">` vide — jamais
 * récupérable sans relancer l'application entière.
 *
 * Cette limite attrape ces exceptions et propose un rechargement du
 * Renderer seul (`location.reload()`), bien plus léger qu'un redémarrage
 * complet du programme — et rapporte l'erreur au Main process pour qu'elle
 * soit diagnosticable depuis le poste du client (voir preload
 * `reportRendererError`, lui-même best-effort et jamais bloquant).
 */
interface Props {
  children: ReactNode;
}

interface State {
  erreur: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  override componentDidCatch(erreur: Error, info: ErrorInfo): void {
    try {
      window.maxiEquip.reportRendererError({
        source: "ErrorBoundary",
        message: erreur.message,
        stack: `${erreur.stack ?? ""}\n${info.componentStack ?? ""}`,
      });
    } catch {
      // Best-effort — ne doit jamais aggraver le problème initial.
    }
  }

  override render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: defaultTokens.colors.surfaceAlt,
          padding: 24,
        }}
      >
        <Card elevated style={{ width: "min(480px, 92vw)", textAlign: "center" }}>
          <AlertTriangle size={32} color={defaultTokens.colors.danger} style={{ marginBottom: 12 }} />
          <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 18, margin: "0 0 8px" }}>
            Une erreur inattendue s'est produite
          </h1>
          <p style={{ fontSize: 13, color: defaultTokens.colors.textSoft, margin: "0 0 18px" }}>
            L'application a rencontré un problème et ne peut pas continuer sur cet écran. Vos données ne sont pas
            perdues — rechargez pour reprendre.
          </p>
          <Button onClick={() => window.location.reload()}>Recharger l'application</Button>
        </Card>
      </div>
    );
  }
}
