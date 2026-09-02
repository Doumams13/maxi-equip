/**
 * Tokens partagés entre l'application Windows, le site vitrine et la
 * génération des factures PDF (Synthèse §10, Corrections §8).
 *
 * IMPORTANT : la charte graphique officielle de MAXI EQUIP n'a pas encore
 * été fournie. Les valeurs ci-dessous reprennent l'identité provisoire
 * déjà développée dans la maquette. Elles sont regroupées dans un seul
 * objet exporté (`defaultTokens`) précisément pour pouvoir être
 * remplacées d'un bloc, sans toucher au reste du code, dès réception de
 * la charte définitive — voir `docs/architecture/PHASE0.md`.
 *
 * Rappel de ce qui est partagé et de ce qui ne l'est pas (Corrections §8) :
 * couleurs, typographies, espacements, rayons et apparence des composants
 * de base SONT partagés. La disposition des écrans et les comportements
 * d'interaction restent propres à chaque surface (application vs site).
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

export interface DesignTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
}

/** Identité provisoire (issue de la maquette), remplacée dès réception de la charte officielle. */
export const defaultTokens: DesignTokens = {
  colors: {
    bg: "#EFEDE6",
    surface: "#FFFFFF",
    surfaceAlt: "#F7F5F0",
    sidebar: "#20242A",
    sidebarActive: "#2B313A",
    sidebarBorder: "#31373F",
    text: "#23262B",
    textSoft: "#6B6E73",
    textFaint: "#9A9C9F",
    border: "#E2DFD6",
    borderSoft: "#EBE8E0",
    accent: "#B5673D",
    accentHover: "#9C552F",
    accentSoft: "#F3E3D8",
    success: "#3F7D5C",
    successSoft: "#E4EFE8",
    warning: "#B8842A",
    warningSoft: "#F5EAD6",
    danger: "#B04438",
    dangerSoft: "#F5E1DE",
    info: "#4A6FA5",
    infoSoft: "#E4EAF3",
    externe: "#7A5CA8",
    externeSoft: "#EAE3F3",
  },
  typography: {
    display: "'Manrope', 'Inter', sans-serif",
    body: "'Inter', sans-serif",
    mono: "'IBM Plex Mono', monospace",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
};
