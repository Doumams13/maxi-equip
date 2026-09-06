import type { CSSProperties, ReactNode, HTMLAttributes } from "react";
import { defaultTokens } from "../tokens.js";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  children: ReactNode;
  padding?: number;
  /** Ajoute une ombre douce (carte "élevée") — utilisé notamment pour la carte de connexion. */
  elevated?: boolean;
  style?: CSSProperties;
}

export function Card({ children, padding = 20, elevated = false, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
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
