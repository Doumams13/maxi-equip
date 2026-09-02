import type { ButtonHTMLAttributes, ReactNode } from "react";
import { defaultTokens } from "../tokens.js";

/**
 * Bouton de base partagé. Ce composant définit l'APPARENCE (couleurs,
 * rayons, typographie) — jamais la disposition ou la densité de l'écran
 * qui l'entoure, propres à chaque surface (Corrections §8).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; color: string; border: string }> = {
  primary: { bg: defaultTokens.colors.accent, color: "#fff", border: defaultTokens.colors.accent },
  secondary: { bg: "#fff", color: defaultTokens.colors.text, border: defaultTokens.colors.border },
  ghost: { bg: "transparent", color: defaultTokens.colors.textSoft, border: "transparent" },
  danger: { bg: "#fff", color: defaultTokens.colors.danger, border: defaultTokens.colors.dangerSoft },
};

export function Button({ variant = "primary", style, children, ...rest }: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <button
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: defaultTokens.spacing.xs + 3,
        padding: "10px 16px",
        borderRadius: defaultTokens.radius.sm,
        fontFamily: defaultTokens.typography.body,
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
