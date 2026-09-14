import type { Config } from "tailwindcss";
import { tokens } from "./src/design-system/tokens";

// IMPORTANT — Design system
// Ce fichier traduit en classes Tailwind les tokens définis dans
// `src/design-system/tokens.ts`. Il s'agit d'une COPIE LOCALE temporaire du
// design system MAXI EQUIP partagé (packages/design-system), décrit dans la
// Synthèse d'architecture (étape 10) comme commun à l'application Windows, au
// site et aux factures PDF. Le vrai monorepo n'ayant pas été fourni pour cette
// phase, cette copie reproduit fidèlement les valeurs identifiées dans les
// visuels officiels (logo, écran de connexion validé en Phase 1) afin que le
// site reste visuellement cohérent avec l'application dès aujourd'hui.
// À l'intégration réelle : supprimer ce fichier de tokens et importer
// directement les tokens de @maxi-equip/design-system à la place.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        green: tokens.colors.green,
        ink: tokens.colors.ink,
        sand: tokens.colors.sand,
        accent: tokens.colors.accent,
        status: tokens.colors.status,
      },
      fontFamily: {
        display: [...tokens.typography.display],
        body: [...tokens.typography.body],
      },
      borderRadius: tokens.radii,
      spacing: tokens.spacing,
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 20, 0.06), 0 8px 24px rgba(15, 23, 20, 0.08)",
        floating: "0 12px 32px rgba(15, 23, 20, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
