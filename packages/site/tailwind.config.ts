import type { Config } from "tailwindcss";
import { tokens } from "./src/design-system/tokens";

// Refonte complète — voir src/design-system/tokens.ts pour le détail des
// choix de palette/typographie. Ce fichier reste une copie locale du
// design system MAXI EQUIP, à remplacer par un import direct de
// @maxi-equip/design-system le jour où l'architecture le permettra.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stone: tokens.colors.stone,
        pine: tokens.colors.pine,
        clay: tokens.colors.clay,
        status: tokens.colors.status,
      },
      fontFamily: {
        display: [...tokens.typography.display],
        body: [...tokens.typography.body],
      },
      borderRadius: tokens.radii,
      spacing: tokens.spacing,
      boxShadow: {
        // Refonte : plus aucune ombre "carte SaaS" systématique — une
        // seule ombre discrète, réservée aux éléments réellement flottants
        // (menus, modales), jamais posée sous chaque carte produit.
        floating: "0 16px 40px rgba(14, 31, 26, 0.16)",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
