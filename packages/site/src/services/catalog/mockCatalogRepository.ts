import { mockProducts } from "@/mock/products";
import { mockPromotions } from "@/mock/promotions";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getEffectivePrice, getModelDisplayPrice, promotionsForVariant } from "@/lib/pricing";
import { getSmallestVariantSortValue } from "@/lib/tileSize";
import type {
  CatalogFilters,
  CatalogRepository,
  CatalogSort,
} from "./CatalogRepository";

/** Simule une latence réseau réaliste, pour que les états "loading" des pages soient réellement exercés même sur les mocks. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Correction "Défaut 3" — un modèle ne doit être considéré "en promotion"
 * (pour le filtre ET pour tout autre usage) QUE si la variante réellement
 * AFFICHÉE sur sa carte (la moins chère — voir `getModelDisplayPrice`) est
 * elle-même en promotion. Vérifié avec les données réelles : "Marbre Blanc"
 * a une promotion sur son 60x60 (15 000 → 12 500 FCFA), mais son 40x40
 * (9 500 FCFA, sans promotion) reste moins cher — la carte affiche donc
 * "à partir de 9 500 FCFA" sans aucun badge. Avant cette correction, le
 * filtre l'incluait quand même car IL SUFFISAIT qu'UNE variante quelconque
 * ait une promotion, sans jamais vérifier que c'est bien CELLE affichée.
 *
 * Remplace l'ancienne fonction `modelHasActivePromotion` (qui vérifiait
 * "au moins une variante a une promo active", sans lien avec l'affichage
 * réel de la carte) — jamais gardée en parallèle, pour ne jamais risquer
 * une désynchronisation future entre le filtre et la carte.
 */
function modelDisplayedPriceIsPromoted(model: ProductModel, promotions: Promotion[]): boolean {
  return getModelDisplayPrice(model.variants, promotions, model.id).effective.isPromotionActive;
}

function modelMinPrice(model: ProductModel, promotions: Promotion[]): number {
  const prices = model.variants.map((variant) => {
    const applicable = promotionsForVariant(promotions, model.id, variant.id);
    const effective = getEffectivePrice(variant.priceFcfa, applicable);
    return effective.promoPriceFcfa ?? effective.normalPriceFcfa;
  });
  return Math.min(...prices);
}

export class MockCatalogRepository implements CatalogRepository {
  async listModels(filters: CatalogFilters, sort: CatalogSort): Promise<ProductModel[]> {
    const promotions = mockPromotions;
    let results = [...mockProducts];

    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      results = results.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q) ||
          m.variants.some((v) => v.reference.toLowerCase().includes(q))
      );
    }
    if (filters.type) {
      results = results.filter((m) => m.type === filters.type);
    }
    if (filters.size) {
      results = results.filter((m) => m.variants.some((v) => v.size === filters.size));
    }
    if (filters.onlyPromotions) {
      results = results.filter((m) => modelDisplayedPriceIsPromoted(m, promotions));
    }
    if (filters.minPriceFcfa !== undefined) {
      const min = filters.minPriceFcfa;
      results = results.filter((m) => modelMinPrice(m, promotions) >= min);
    }
    if (filters.maxPriceFcfa !== undefined) {
      const max = filters.maxPriceFcfa;
      results = results.filter((m) => modelMinPrice(m, promotions) <= max);
    }

    switch (sort) {
      case "type_size":
        // Tri par défaut du catalogue (voir DEFAULT_CATALOG_SORT) : par type
        // de carreau, puis par la plus petite taille disponible au sein de
        // ce type (classement numérique, pas alphabétique — voir
        // src/lib/tileSize.ts). En cas d'égalité totale (même type, même
        // plus petite taille), on départage par nom pour un ordre stable et
        // reproductible.
        results.sort((a, b) => {
          const typeCompare = a.type.localeCompare(b.type, "fr");
          if (typeCompare !== 0) return typeCompare;
          const sizeCompare =
            getSmallestVariantSortValue(a.variants) - getSmallestVariantSortValue(b.variants);
          if (sizeCompare !== 0) return sizeCompare;
          return a.name.localeCompare(b.name, "fr");
        });
        break;
      case "name_asc":
        results.sort((a, b) => a.name.localeCompare(b.name, "fr"));
        break;
      case "recent":
        results.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        break;
      case "relevance":
      default:
        // Ordre "pertinence" par défaut : mis en avant d'abord, puis plus récents.
        results.sort((a, b) => {
          if (Boolean(a.featured) !== Boolean(b.featured)) {
            return a.featured ? -1 : 1;
          }
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        break;
    }

    return delay(results);
  }

  async getModelBySlug(slug: string): Promise<ProductModel | null> {
    const found = mockProducts.find((m) => m.slug === slug) ?? null;
    return delay(found);
  }

  async listFeaturedModels(): Promise<ProductModel[]> {
    return delay(mockProducts.filter((m) => m.featured));
  }

  async listPromotions(): Promise<Promotion[]> {
    return delay(mockPromotions);
  }

  async listAvailableTypes(): Promise<string[]> {
    const types = Array.from(new Set(mockProducts.map((m) => m.type)));
    return delay(types.sort((a, b) => a.localeCompare(b, "fr")));
  }

  async listAvailableSizes(): Promise<string[]> {
    const sizes = new Set<string>();
    mockProducts.forEach((m) => m.variants.forEach((v) => sizes.add(v.size)));
    return delay(Array.from(sizes).sort());
  }
}
