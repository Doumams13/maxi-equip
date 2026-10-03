import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getEffectivePrice, getModelDisplayPrice, promotionsForVariant } from "@/lib/pricing";
import { getSmallestVariantSortValue } from "@/lib/tileSize";
import type { CatalogFilters, CatalogSort } from "./CatalogRepository";

/**
 * Filtrage + tri du catalogue public — extrait de `mockCatalogRepository.ts`
 * (correction "Intégration Site Phase 5, Partie 3 (site réel)") pour être
 * réutilisé TEL QUEL par `ApiCatalogRepository`. Fonction PURE, opérant
 * uniquement sur des données déjà chargées (jamais d'accès réseau ici) —
 * exactement la même logique métier pour les données mockées et les
 * données réelles, jamais une seconde implémentation qui risquerait de
 * diverger (règle explicite de la Phase 5 : "ne pas créer de seconde
 * logique métier contradictoire").
 */

/**
 * Correction "Défaut 3" — un modèle ne doit être considéré "en promotion"
 * (pour le filtre ET pour tout autre usage) QUE si la variante réellement
 * AFFICHÉE sur sa carte (la moins chère — voir `getModelDisplayPrice`) est
 * elle-même en promotion.
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

export function applyFiltersAndSort(
  models: ProductModel[],
  promotions: Promotion[],
  filters: CatalogFilters,
  sort: CatalogSort
): ProductModel[] {
  let results = [...models];

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
        const sizeCompare = getSmallestVariantSortValue(a.variants) - getSmallestVariantSortValue(b.variants);
        if (sizeCompare !== 0) return sizeCompare;
        return a.name.localeCompare(b.name, "fr");
      });
      break;
    case "name_asc":
      results.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      break;
    case "recent":
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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

  return results;
}

export function deriveAvailableTypes(models: ProductModel[]): string[] {
  const types = Array.from(new Set(models.map((m) => m.type)));
  return types.sort((a, b) => a.localeCompare(b, "fr"));
}

export function deriveAvailableSizes(models: ProductModel[]): string[] {
  const sizes = new Set<string>();
  models.forEach((m) => m.variants.forEach((v) => sizes.add(v.size)));
  return Array.from(sizes).sort();
}
