import { defaultTokens } from "../tokens.js";

export interface LogoProps {
  /** Provient de ParametresEntreprise.logoUrl — null tant que MAXI EQUIP
   * n'a pas fourni son logo officiel (Synthèse §13, Corrections §8). */
  logoUrl?: string | null;
  size?: number;
  /** Largeur explicite, pour un logo non carré (le logo officiel MAXI EQUIP ne l'est pas). Prioritaire sur `size`. */
  width?: number;
  height?: number;
}

/**
 * Affiche le logo réel dès qu'il est disponible (`logoUrl`), ou un repère
 * visuel neutre en attendant — jamais un écran cassé ou vide. Le logo
 * n'est jamais recadré de façon à en déformer les proportions
 * (`objectFit: contain`) — l'identité graphique officielle doit toujours
 * apparaître exactement telle que fournie.
 */
export function Logo({ logoUrl = null, size = 34, width, height }: LogoProps) {
  const w = width ?? size;
  const h = height ?? size;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Logo MAXI EQUIP"
        width={w}
        height={h}
        style={{ objectFit: "contain", flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      aria-label="Logo MAXI EQUIP (provisoire)"
      style={{
        width: w,
        height: h,
        borderRadius: defaultTokens.radius.sm,
        flexShrink: 0,
        background: `linear-gradient(135deg, ${defaultTokens.colors.accent}, ${defaultTokens.colors.accentHover})`,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: 2,
        padding: Math.min(w, h) * 0.15,
      }}
    >
      <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 2 }} />
      <div style={{ background: "rgba(255,255,255,0.55)", borderRadius: 2 }} />
      <div style={{ background: "rgba(255,255,255,0.55)", borderRadius: 2 }} />
      <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 2 }} />
    </div>
  );
}
