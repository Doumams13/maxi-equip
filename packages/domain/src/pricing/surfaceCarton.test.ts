import { describe, it, expect } from "vitest";
import {
  calculerSurfaceCarreauM2,
  calculerSurfaceCartonM2,
  calculerPrixCartonDepuisPrixM2,
  calculerPrixM2DepuisPrixCarton,
} from "./surfaceCarton.js";

describe("calculerSurfaceCarreauM2", () => {
  it("60x60 cm → 0.36 m²", () => {
    expect(calculerSurfaceCarreauM2(60, 60)).toBeCloseTo(0.36, 6);
  });
  it("40x40 cm → 0.16 m²", () => {
    expect(calculerSurfaceCarreauM2(40, 40)).toBeCloseTo(0.16, 6);
  });
});

describe("calculerSurfaceCartonM2", () => {
  it("60x60, 4 carreaux/carton → 1.44 m² (exemple réel donné par l'utilisateur)", () => {
    expect(calculerSurfaceCartonM2(4, 60, 60)).toBeCloseTo(1.44, 6);
  });
  it("40x40, 12 carreaux/carton → 1.92 m² (exemple réel donné par l'utilisateur)", () => {
    expect(calculerSurfaceCartonM2(12, 40, 40)).toBeCloseTo(1.92, 6);
  });
});

describe("calculerPrixCartonDepuisPrixM2 / calculerPrixM2DepuisPrixCarton — aller-retour cohérent", () => {
  it("8000 FCFA/m² sur un carton de 1.44 m² → 11 520 FCFA/carton (exemple réel)", () => {
    expect(calculerPrixCartonDepuisPrixM2(8000, 1.44)).toBe(11520);
  });

  it("l'aller-retour prix carton → prix m² → prix carton redonne la même valeur", () => {
    const prixCarton = 11520;
    const surface = 1.44;
    const prixM2 = calculerPrixM2DepuisPrixCarton(prixCarton, surface);
    expect(prixM2).toBe(8000);
    expect(calculerPrixCartonDepuisPrixM2(prixM2, surface)).toBe(prixCarton);
  });

  it("arrondit au FCFA le plus proche quand la division ne tombe pas juste", () => {
    expect(calculerPrixM2DepuisPrixCarton(10000, 3)).toBe(3333);
  });
});
