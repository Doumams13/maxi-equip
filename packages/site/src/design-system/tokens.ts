/**
 * MAXI EQUIP — Design tokens, refonte complète (2026).
 * ------------------------------------------------------
 * Nouvelle direction visuelle : un vrai showroom de carrelage, pas un
 * gabarit générique. Palette ancrée sur l'identité réelle de
 * l'application MAXI EQUIP (accent vert #2E7D32, voir
 * packages/design-system/src/tokens.ts) pour une continuité de marque
 * authentique entre l'application et le site, réinterprétée en une
 * teinte plus profonde et premium pour l'usage éditorial du site.
 *
 * Reste une copie locale : ce fichier disparaîtra le jour où le site
 * importera directement @maxi-equip/design-system.
 */

export const tokens = {
  colors: {
    stone: {
      50: "#F7F4EF",
      100: "#EFEAE1",
      200: "#E2DACB",
      300: "#CBBFA8",
      400: "#A99C82",
      500: "#847860",
      600: "#635947",
      700: "#4A4235",
      800: "#332D24",
      900: "#211F1B",
    },
    pine: {
      50: "#EAF3EC",
      100: "#CCE3D1",
      200: "#9BC8A5",
      300: "#69AC77",
      400: "#3F8F52",
      500: "#2E7D32",
      600: "#256328",
      700: "#1B4A21",
      800: "#16302A",
      900: "#0E1F1A",
    },
    clay: {
      50: "#FBEDE7",
      100: "#F3D2C2",
      300: "#D68A62",
      500: "#AD4E2C",
      600: "#8F3F22",
      700: "#72331C",
    },
    status: {
      success: "#1B4A21",
      successBg: "#EAF3EC",
      error: "#8F3F22",
      errorBg: "#FBEDE7",
      warning: "#8A5A00",
      warningBg: "#FDF3DF",
      info: "#332D24",
      infoBg: "#EFEAE1",
    },
  },
  typography: {
    /**
     * Correction — next/font/google (Fraunces/Inter) nécessite un accès
     * réseau à Google Fonts au moment du build. Cet environnement de
     * développement n'y a pas accès (allowlist réseau restreinte), ce
     * qui empêchait toute vérification réelle du build. Piles de
     * polices SYSTÈME fiables à la place, sans dépendance réseau :
     * conserve l'intention (serif à caractère pour les titres, sans
     * fonctionnel pour le corps) tout en restant réellement vérifiable
     * ici ET chez l'utilisateur final, quel que soit son réseau au
     * moment du build.
     */
    display: ["Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
    body: [
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
      "Roboto",
      "Helvetica Neue",
      "Arial",
      "sans-serif",
    ],
  },
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2.5rem",
    "2xl": "4rem",
  },
  radii: {
    none: "0",
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
  },
} as const;

export type DesignTokens = typeof tokens;
