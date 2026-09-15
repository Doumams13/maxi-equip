export const tokens = {
  colors: {
    bg: "#F4EEE2",
    surface: "#FFFFFF",
    surfaceSoft: "#EDE6D6",
    text: "#191C19",
    textMute: "#5C6058",
    forest: "#1F4832",
    forestDeep: "#122A1D",
    sage: "#4C7A5C",
    sagePale: "#DCE3D6",
    clay: "#B15E2C",
    line: "rgba(25,28,25,0.14)",
    lineSoft: "rgba(25,28,25,0.08)",
    status: {
      error: "#B15E2C",
      errorBg: "#F3E3D8",
    },
  },
  typography: {
    /**
     * Correction d'environnement — next/font/google (Fraunces/Manrope,
     * les polices exactes de la maquette de référence) nécessite un
     * accès réseau à Google Fonts au moment du build, indisponible dans
     * cet environnement de développement (déjà rencontré lors des
     * refontes précédentes). Piles de polices système qui se
     * rapprochent visuellement de l'intention (serif à empattements
     * pour Fraunces, sans-serif géométrique nette pour Manrope) —
     * permet une vérification réelle du build ici ET chez
     * l'utilisateur final, quel que soit son réseau au moment du build.
     */
    display: ["Georgia", "Iowan Old Style", "Palatino Linotype", "serif"],
    body: ["Segoe UI", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
  },
} as const;

export type DesignTokens = typeof tokens;
