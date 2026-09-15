import type { Config } from "tailwindcss";
import { tokens } from "./src/design-system/tokens";

// Refonte totale ("Le Journal des Matières") — voir tokens.ts pour le
// raisonnement complet. Copie locale du design system, à remplacer par
// un import direct de @maxi-equip/design-system le jour venu.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: tokens.colors.ink,
        paper: tokens.colors.paper,
        ember: tokens.colors.ember,
        moss: tokens.colors.moss,
        status: tokens.colors.status,
      },
      fontFamily: {
        display: [...tokens.typography.display],
        body: [...tokens.typography.body],
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      fontSize: {
        "display-1": ["clamp(3rem, 7vw, 7rem)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
        "display-2": ["clamp(2.25rem, 4.5vw, 4rem)", { lineHeight: "0.98", letterSpacing: "-0.025em" }],
      },
    },
  },
  plugins: [],
};

export default config;
