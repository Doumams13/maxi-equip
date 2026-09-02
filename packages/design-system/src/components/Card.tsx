import type { CSSProperties, ReactNode } from "react";
import { defaultTokens } from "../tokens.js";

export interface CardProps {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}

export function Card({ children, padding = 20, style }: CardProps) {
  return (
    <div
      style={{
        background: defaultTokens.colors.surface,
        border: `1px solid ${defaultTokens.colors.borderSoft}`,
        borderRadius: defaultTokens.radius.lg,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
