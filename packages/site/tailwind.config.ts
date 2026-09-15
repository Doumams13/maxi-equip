import type { Config } from "tailwindcss";
import { tokens } from "./src/design-system/tokens";

// Intégration du design HTML de référence — voir src/design-system/tokens.ts.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: tokens.colors.bg,
        surface: tokens.colors.surface,
        "surface-soft": tokens.colors.surfaceSoft,
        ink: tokens.colors.text,
        "ink-mute": tokens.colors.textMute,
        forest: tokens.colors.forest,
        "forest-deep": tokens.colors.forestDeep,
        sage: tokens.colors.sage,
        "sage-pale": tokens.colors.sagePale,
        clay: tokens.colors.clay,
        status: tokens.colors.status,
      },
      fontFamily: {
        display: [...tokens.typography.display],
        body: [...tokens.typography.body],
      },
      borderRadius: {
        DEFAULT: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
