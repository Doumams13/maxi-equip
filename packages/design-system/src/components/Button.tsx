import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { defaultTokens } from "../tokens.js";

/**
 * Bouton de base partagé. Ce composant définit l'APPARENCE (couleurs,
 * rayons, typographie) — jamais la disposition ou la densité de l'écran
 * qui l'entoure, propres à chaque surface (Corrections §8).
 *
 * États réellement gérés (Phase 1 — finalisation UI, §8/§23) : normal,
 * survol, focus clavier, appui, désactivé, chargement. Comme le Design
 * System utilise des styles en ligne (pas de feuille CSS séparée), les
 * pseudo-classes CSS (:hover, :active) ne sont pas disponibles — ces
 * états sont donc suivis explicitement via des gestionnaires d'événements
 * React, pas une astuce ni un deuxième système de style.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

interface VariantPalette {
  bg: string;
  bgHover: string;
  bgActive: string;
  color: string;
  border: string;
}

const VARIANT_STYLES: Record<ButtonVariant, VariantPalette> = {
  primary: {
    bg: defaultTokens.colors.accent,
    bgHover: defaultTokens.colors.accentHover,
    bgActive: defaultTokens.colors.accentActive,
    color: "#FFFFFF",
    border: defaultTokens.colors.accent,
  },
  secondary: {
    bg: "#FFFFFF",
    bgHover: defaultTokens.colors.surfaceAlt,
    bgActive: defaultTokens.colors.borderSoft,
    color: defaultTokens.colors.text,
    border: defaultTokens.colors.border,
  },
  ghost: {
    bg: "transparent",
    bgHover: defaultTokens.colors.surfaceAlt,
    bgActive: defaultTokens.colors.borderSoft,
    color: defaultTokens.colors.textSoft,
    border: "transparent",
  },
  danger: {
    bg: "#FFFFFF",
    bgHover: defaultTokens.colors.dangerSoft,
    bgActive: defaultTokens.colors.dangerSoft,
    color: defaultTokens.colors.danger,
    border: defaultTokens.colors.dangerSoft,
  },
};

export function Button({ variant = "primary", loading = false, disabled, style, children, ...rest }: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  const v = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  const background = isDisabled ? defaultTokens.colors.borderSoft : pressed ? v.bgActive : hovered ? v.bgHover : v.bg;
  const color = isDisabled ? defaultTokens.colors.textFaint : v.color;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onMouseEnter={(e) => {
        setHovered(true);
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        setPressed(false);
        rest.onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        setPressed(true);
        rest.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        rest.onMouseUp?.(e);
      }}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: defaultTokens.spacing.xs + 3,
        padding: "11px 18px",
        borderRadius: defaultTokens.radius.sm,
        fontFamily: defaultTokens.typography.body,
        fontWeight: 600,
        fontSize: 14,
        cursor: isDisabled ? "not-allowed" : "pointer",
        background,
        color,
        border: `1px solid ${isDisabled ? defaultTokens.colors.border : v.border}`,
        opacity: loading ? 0.85 : 1,
        boxShadow: focused && !isDisabled ? defaultTokens.shadows.focusRing : "none",
        outline: "none",
        transition: "background-color 120ms ease, box-shadow 120ms ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
