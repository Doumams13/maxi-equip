import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { defaultTokens } from "../tokens.js";
import type { ToastItem, ToastType } from "./types.js";

interface TypeStyle {
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
  border: string;
  /** "assertive" interrompt les technologies d'assistance (erreur/avertissement) ; "polite" attend une pause (succès/information) — §7. */
  ariaLive: "assertive" | "polite";
  role: "alert" | "status";
}

const TYPE_STYLES: Record<ToastType, TypeStyle> = {
  success: {
    icon: CheckCircle2,
    color: defaultTokens.colors.success,
    bg: defaultTokens.colors.successSoft,
    border: defaultTokens.colors.success,
    ariaLive: "polite",
    role: "status",
  },
  error: {
    icon: XCircle,
    color: defaultTokens.colors.danger,
    bg: defaultTokens.colors.dangerSoft,
    border: defaultTokens.colors.danger,
    ariaLive: "assertive",
    role: "alert",
  },
  warning: {
    icon: AlertTriangle,
    color: defaultTokens.colors.warning,
    bg: defaultTokens.colors.warningSoft,
    border: defaultTokens.colors.warning,
    ariaLive: "assertive",
    role: "alert",
  },
  info: {
    icon: Info,
    color: defaultTokens.colors.info,
    bg: defaultTokens.colors.infoSoft,
    border: defaultTokens.colors.info,
    ariaLive: "polite",
    role: "status",
  },
};

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

/** Durée de l'animation d'entrée/sortie — légère, professionnelle (§5). */
const ANIMATION_MS = 180;

export function Toast({ toast, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const style = TYPE_STYLES[toast.type];
  const Icon = style.icon;

  // Apparition fluide : monté hors-écran (opacity 0), puis transition vers
  // l'état visible juste après le montage.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleDismiss() {
    // Disparition fluide : on repasse à l'état "invisible" puis on retire
    // réellement l'élément après la durée de l'animation.
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), ANIMATION_MS);
  }

  return (
    <div
      role={style.role}
      aria-live={style.ariaLive}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        padding: "12px 14px",
        borderRadius: defaultTokens.radius.md,
        background: defaultTokens.colors.surface,
        border: `1px solid ${style.border}`,
        borderLeftWidth: 4,
        boxShadow: defaultTokens.shadows.card,
        fontFamily: defaultTokens.typography.body,
        transform: visible ? "translateX(0)" : "translateX(16px)",
        opacity: visible ? 1 : 0,
        transition: `transform ${ANIMATION_MS}ms ease, opacity ${ANIMATION_MS}ms ease`,
      }}
    >
      <Icon size={18} color={style.color} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: defaultTokens.colors.text }}>{toast.title}</div>
        <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft, marginTop: 2 }}>{toast.message}</div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fermer la notification"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
          flexShrink: 0,
          borderRadius: 4,
          display: "flex",
        }}
      >
        <X size={14} color={defaultTokens.colors.textFaint} />
      </button>
    </div>
  );
}
