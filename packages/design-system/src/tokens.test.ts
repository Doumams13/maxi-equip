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

describe("échelle typographique fluide (correction responsive)", () => {
  function parseClamp(value: string): { min: number; max: number } {
    const match = value.match(/clamp\(([\d.]+)px,.*?,\s*([\d.]+)px\)/);
    if (!match) throw new Error(`Format clamp() inattendu : ${value}`);
    return { min: parseFloat(match[1]!), max: parseFloat(match[2]!) };
  }

  it("chaque taille a une borne minimale strictement inférieure à sa borne maximale", () => {
    for (const [nom, valeur] of Object.entries(defaultTokens.fluidType)) {
      const { min, max } = parseClamp(valeur);
      expect(min, `${nom} : min doit être < max`).toBeLessThan(max);
    }
  });

  it("la hiérarchie est respectée : h1 > h2 > body > bodySmall > label > caption, à la fois en borne min et en borne max", () => {
    const ordre: (keyof typeof defaultTokens.fluidType)[] = ["h1", "h2", "body", "bodySmall", "label", "caption"];
    for (let i = 0; i < ordre.length - 1; i++) {
      const a = parseClamp(defaultTokens.fluidType[ordre[i]!]);
      const b = parseClamp(defaultTokens.fluidType[ordre[i + 1]!]);
      expect(a.min, `${ordre[i]} min >= ${ordre[i + 1]} min`).toBeGreaterThanOrEqual(b.min);
      expect(a.max, `${ordre[i]} max >= ${ordre[i + 1]} max`).toBeGreaterThanOrEqual(b.max);
    }
  });

  it("aucune taille ne descend en dessous de 10px (lisibilité minimale) ni au-dessus de 28px (évite le gigantisme en plein écran)", () => {
    for (const valeur of Object.values(defaultTokens.fluidType)) {
      const { min, max } = parseClamp(valeur);
      expect(min).toBeGreaterThanOrEqual(10);
      expect(max).toBeLessThanOrEqual(28);
    }
  });
});

describe("tokens de mise en page (correction responsive)", () => {
  it("expose une largeur maximale de contenu et une largeur de sidebar fixes", () => {
    expect(defaultTokens.layout.contentMaxWidth).toBeGreaterThan(defaultTokens.layout.sidebarWidth);
    expect(defaultTokens.layout.sidebarWidth).toBe(220); // inchangée par cette correction — la sidebar reste fixe, jamais disproportionnée
  });
});
