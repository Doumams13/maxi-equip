import { describe, expect, it } from "vitest";
import { defaultTokens } from "./tokens.js";

describe("design-system tokens (Phase 0 smoke test)", () => {
  it("expose une couleur d'accent valide", () => {
    expect(defaultTokens.colors.accent).toMatch(/^#([0-9A-Fa-f]{6})$/);
  });

  it("expose les trois familles de typographie attendues", () => {
    expect(defaultTokens.typography.display).toContain("Manrope");
    expect(defaultTokens.typography.body).toContain("Inter");
    expect(defaultTokens.typography.mono).toContain("IBM Plex Mono");
  });
});
