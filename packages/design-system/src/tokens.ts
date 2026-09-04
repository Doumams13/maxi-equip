/**
 * Tokens partagés entre l'application Windows, le site vitrine et la
 * génération des factures PDF (Synthèse §10, Corrections §8).
 *
 * IDENTITÉ OFFICIELLE MAXI EQUIP — intégrée à partir de la Phase 1
 * (finalisation UI). La palette ci-dessous est construite autour du vert
 * de la charte officielle et du logo fourni par MAXI EQUIP
 * (packages/electron-app/src/renderer/assets/maxi-equip-logo.png, utilisé
 * tel quel, jamais modifié). Cette palette est désormais LA référence
 * pour l'ensemble du logiciel — écran de connexion, tableau de bord, et
 * tous les écrans à venir dans les phases suivantes (Corrections §8 :
 * seuls les tokens sont partagés, jamais la disposition des écrans).
 *
 * Les noms de clés reprennent volontairement ceux déjà utilisés par les
 * composants existants (Button, Card) — seules les VALEURS changent, pour
 * ne jamais dupliquer le Design System (cf. consigne explicite Phase 1 :
 * "ne crée pas un deuxième Design System").
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  sidebar: string;
  sidebarActive: string;
  sidebarBorder: string;
  text: string;
  textSoft: string;
  textFaint: string;
  border: string;
  borderSoft: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  externe: string;
  externeSoft: string;
  /** Vert décoratif utilisé pour les formes géométriques discrètes en arrière-plan (écran de connexion notamment). */
  decorative: string;
}

export interface TypographyTokens {
  display: string;
  body: string;
  mono: string;
}

export interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface ShadowTokens {
  card: string;
  focusRing: string;
}

export interface DesignTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
}

/** Identité officielle MAXI EQUIP (vert), construite à partir du logo fourni. */
export const defaultTokens: DesignTokens = {
  colors: {
    bg: "#F6F8F6",
    surface: "#FFFFFF",
    surfaceAlt: "#F0F4F0",
    sidebar: "#14231A",
    sidebarActive: "#1C2E20",
    sidebarBorder: "#22392A",
    text: "#1B2A1D",
    textSoft: "#5B6B5D",
    textFaint: "#8E9C90",
    border: "#E1E7E1",
    borderSoft: "#EDF2ED",
    accent: "#2E7D32",
    accentHover: "#256B29",
    accentActive: "#1E5723",
    accentSoft: "#E3F1E3",
    success: "#2E7D32",
    successSoft: "#E3F1E3",
    warning: "#B8842A",
    warningSoft: "#F5EAD6",
    danger: "#B04438",
    dangerSoft: "#F5E1DE",
    info: "#4A6FA5",
    infoSoft: "#E4EAF3",
    externe: "#7A5CA8",
    externeSoft: "#EAE3F3",
    decorative: "#8BC34A",
  },
  typography: {
    display: "'Manrope', 'Inter', sans-serif",
    body: "'Inter', sans-serif",
    mono: "'IBM Plex Mono', monospace",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  shadows: {
    card: "0 20px 45px -15px rgba(20, 40, 20, 0.22)",
    focusRing: "0 0 0 3px rgba(46, 125, 50, 0.25)",
  },
};
