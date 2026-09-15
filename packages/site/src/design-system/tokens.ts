export const tokens = {
  colors: {
    ink: {
      DEFAULT: "#14120F",
      soft: "#211E19",
    },
    paper: {
      DEFAULT: "#F3EEE4",
      soft: "#EAE3D3",
    },
    ember: {
      DEFAULT: "#C1440E",
      soft: "#F0DCCB",
      deep: "#8F3308",
    },
    moss: {
      DEFAULT: "#34432B",
      soft: "#E4E9DC",
    },
    status: {
      error: "#8F3308",
      errorBg: "#F0DCCB",
    },
  },
  typography: {
    display: ["Georgia", "Iowan Old Style", "Times New Roman", "serif"],
    body: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
  },
} as const;

export type DesignTokens = typeof tokens;
