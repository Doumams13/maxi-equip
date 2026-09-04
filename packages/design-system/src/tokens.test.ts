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

describe("identité officielle MAXI EQUIP (Phase 1 — finalisation UI)", () => {
  it("la couleur d'accent principale est bien un vert (identité officielle du logo)", () => {
    // Vérifie que la teinte est dominée par le canal vert (G > R et G > B),
    // conformément à l'identité officielle — pas une couleur arbitraire.
    const hex = defaultTokens.colors.accent.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("expose des ombres pour la carte et l'anneau de focus", () => {
    expect(defaultTokens.shadows.card).toBeTruthy();
    expect(defaultTokens.shadows.focusRing).toBeTruthy();
  });

  it("expose une couleur décorative distincte de l'accent principal", () => {
    expect(defaultTokens.colors.decorative).toBeTruthy();
    expect(defaultTokens.colors.decorative).not.toBe(defaultTokens.colors.accent);
  });
});
