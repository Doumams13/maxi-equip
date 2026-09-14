/**
 * MAXI EQUIP — Design tokens (copie locale, Phase 5)
 * ----------------------------------------------------
 * Source de vérité prévue : packages/design-system/src/tokens.ts (Synthèse
 * d'architecture, étape 10 — "un ensemble unique de tokens... partagé entre
 * l'application Windows, le site vitrine et la génération des factures PDF").
 *
 * Ce fichier n'existait pas dans le pack de référence fourni pour cette phase
 * (le vrai monorepo n'a pas été communiqué). Les valeurs ci-dessous ont donc
 * été dérivées, PAS inventées, à partir :
 *  - du logo officiel MAXI EQUIP (VISUELS/LOGO_MAXI_EQUIP_REFERENCE.png),
 *    utilisé tel quel, jamais redessiné ;
 *  - de l'écran de connexion validé en Phase 1 (identité "palette verte"
 *    confirmée officielle par le compte-rendu Phase 1, §11).
 *
 * ⚠️ PROVISOIRE : le compte-rendu Phase 0 indique que la charte graphique
 * officielle exacte (codes couleurs, typographies) restait, à la date des
 * documents fournis, un livrable en attente de MAXI EQUIP pour certains
 * aspects. Dès que packages/design-system existera réellement, ce fichier
 * doit être supprimé et remplacé par un import direct du package partagé —
 * aucune autre modification ne devrait être nécessaire ailleurs dans le site
 * puisque tous les composants consomment ces tokens et jamais des couleurs en dur.
 */

export const tokens = {
  colors: {
    /** Vert MAXI EQUIP — identité officielle validée (logo + écran de connexion Phase 1) */
    green: {
      50: "#EEF6E9",
      100: "#D8ECC9",
      200: "#B4DA9B",
      300: "#8FC76D",
      400: "#6FAE49",
      500: "#4C7A2A", // vert primaire (proche du bloc logo, #5a892a échantillonné)
      600: "#3B6B22", // vert d'action / boutons (proche du bouton "Se connecter", #367b3d)
      700: "#2C5419", // vert profond (bandeaux, hero) — proche du dégradé de l'écran de connexion
      800: "#1E3E11",
      900: "#12280A",
    },
    /** Neutres graphite, proches de la barre de titre de l'application (#1c2c31) */
    ink: {
      50: "#F5F7F6",
      100: "#E7EBE9",
      200: "#C7D0CC",
      300: "#98A6A0",
      400: "#67766F",
      500: "#44534C",
      600: "#31403A",
      700: "#243330",
      800: "#1C2C31", // barre de titre de l'application Windows (référence exacte)
      900: "#121C1F",
    },
    /** Beige/sable clair pour fonds de section alternés, sans dériver vers la palette brune écartée */
    sand: {
      50: "#FBFAF6",
      100: "#F4F1E9",
      200: "#EAE4D3",
    },
    /** Bleu du pictogramme du logo — utilisé avec parcimonie (jamais comme couleur d'action principale) */
    accent: {
      500: "#0F4FB0",
    },
    status: {
      success: "#2C5419",
      successBg: "#EEF6E9",
      error: "#B3261E",
      errorBg: "#FBEAE9",
      warning: "#8A5A00",
      warningBg: "#FDF3DF",
      info: "#1C2C31",
      infoBg: "#EDF1F0",
    },
  },
  typography: {
    // Aucune police officielle communiquée dans les documents fournis pour cette
    // phase. Choix provisoire : une famille système sobre et très lisible,
    // cohérente avec le ton "productivité + commerce" du projet, à remplacer
    // sans impact structurel si une police de marque est fournie plus tard.
    display: ["Segoe UI", "Inter", "system-ui", "sans-serif"],
    body: ["Segoe UI", "Inter", "system-ui", "sans-serif"],
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
    sm: "0.375rem",
    md: "0.625rem",
    lg: "1rem",
    xl: "1.5rem",
  },
} as const;

export type DesignTokens = typeof tokens;
