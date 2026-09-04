import type { CSSProperties, ReactNode } from "react";
import { defaultTokens } from "../tokens.js";

export interface CardProps {
  children: ReactNode;
  padding?: number;
  /** Ajoute une ombre douce (carte "élevée") — utilisé notamment pour la carte de connexion. */
  elevated?: boolean;
  style?: CSSProperties;
}

export function Card({ children, padding = 20, elevated = false, style }: CardProps) {
  return (
    <div
      style={{
        background: defaultTokens.colors.surface,
        border: `1px solid ${defaultTokens.colors.borderSoft}`,
        borderRadius: defaultTokens.radius.lg,
        boxShadow: elevated ? defaultTokens.shadows.card : "none",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
