import { defaultTokens } from "../tokens.js";

export interface LogoProps {
  /** Provient de ParametresEntreprise.logoUrl — null tant que MAXI EQUIP
   * n'a pas fourni son logo officiel (Synthèse §13, Corrections §8). */
  logoUrl?: string | null;
  size?: number;
}

/**
 * Affiche le logo réel dès qu'il est disponible (`logoUrl`), ou un repère
 * visuel neutre en attendant — jamais un écran cassé ou vide.
 */
export function Logo({ logoUrl = null, size = 34 }: LogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Logo MAXI EQUIP"
        width={size}
        height={size}
        style={{ borderRadius: defaultTokens.radius.sm, objectFit: "cover", flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      aria-label="Logo MAXI EQUIP (provisoire)"
      style={{
        width: size,
        height: size,
        borderRadius: defaultTokens.radius.sm,
        flexShrink: 0,
        background: `linear-gradient(135deg, ${defaultTokens.colors.accent}, ${defaultTokens.colors.accentHover})`,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: 2,
        padding: size * 0.15,
      }}
    >
      <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 2 }} />
      <div style={{ background: "rgba(255,255,255,0.55)", borderRadius: 2 }} />
      <div style={{ background: "rgba(255,255,255,0.55)", borderRadius: 2 }} />
      <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 2 }} />
    </div>
  );
}
