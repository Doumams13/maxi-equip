import { describe, it, expect } from "vitest";
import type { ProductModel } from "@/lib/types/catalog";
import { buildHeroSelection } from "./buildHeroSelection";

function modele(id: string, ordreVitrine: number | null = null): ProductModel {
  return {
    id,
    slug: id,
    name: id,
    type: "Faïence",
    description: "",
    images: [],
    variants: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ordreVitrine,
  };
}

describe("buildHeroSelection", () => {
  it("sans aucune sélection manuelle, retourne exactement le tri récent (comportement par défaut inchangé)", () => {
    const recent = [modele("a"), modele("b"), modele("c")];
    expect(buildHeroSelection([], recent)).toEqual(recent);
  });

  it("place la vitrine en premier, dans l'ordre choisi", () => {
    const vitrine = [modele("x", 0), modele("y", 1)];
    const recent = [modele("y", 1), modele("x", 0), modele("z")];
    const resultat = buildHeroSelection(vitrine, recent, 2);
    expect(resultat.map((m) => m.id)).toEqual(["x", "y"]);
  });

  it("complète avec les modèles récents jusqu'à minCount, sans doublon", () => {
    const vitrine = [modele("x", 0)];
    const recent = [modele("x", 0), modele("a"), modele("b"), modele("c")];
    const resultat = buildHeroSelection(vitrine, recent, 3);
    expect(resultat.map((m) => m.id)).toEqual(["x", "a", "b"]);
  });

  it("ne complète jamais au-delà de minCount même si plus de modèles récents existent (tout s'affiche, rien de plus)", () => {
    const vitrine = [modele("x", 0), modele("y", 1)];
    const recent = [modele("a"), modele("b"), modele("c"), modele("d")];
    const resultat = buildHeroSelection(vitrine, recent, 3);
    expect(resultat.map((m) => m.id)).toEqual(["x", "y", "a"]);
  });

  it("si la vitrine seule dépasse déjà minCount, ne tronque pas (tout ce qui est choisi s'affiche)", () => {
    const vitrine = [modele("x", 0), modele("y", 1), modele("z", 2)];
    const resultat = buildHeroSelection(vitrine, [], 2);
    expect(resultat.map((m) => m.id)).toEqual(["x", "y", "z"]);
  });

  it("moins de modèles récents que minCount : affiche ce qui existe, jamais une erreur", () => {
    const resultat = buildHeroSelection([], [modele("a")], 10);
    expect(resultat.map((m) => m.id)).toEqual(["a"]);
  });
});
