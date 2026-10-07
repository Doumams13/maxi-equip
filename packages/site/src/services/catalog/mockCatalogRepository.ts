import { mockProducts } from "@/mock/products";
import { mockPromotions } from "@/mock/promotions";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { applyFiltersAndSort, deriveAvailableTypes, deriveAvailableSizes } from "./filterModels";
import type {
  CatalogFilters,
  CatalogRepository,
  CatalogSort,
} from "./CatalogRepository";

/** Simule une latence réseau réaliste, pour que les états "loading" des pages soient réellement exercés même sur les mocks. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class MockCatalogRepository implements CatalogRepository {
  async listModels(filters: CatalogFilters, sort: CatalogSort): Promise<ProductModel[]> {
    return delay(applyFiltersAndSort(mockProducts, mockPromotions, filters, sort));
  }

  async getModelBySlug(slug: string): Promise<ProductModel | null> {
    const found = mockProducts.find((m) => m.slug === slug) ?? null;
    return delay(found);
  }

  async listFeaturedModels(): Promise<ProductModel[]> {
    return delay(mockProducts.filter((m) => m.featured));
  }

  async listVitrineModels(): Promise<ProductModel[]> {
    return delay(
      mockProducts
        .filter((m) => m.ordreVitrine !== null)
        .sort((a, b) => a.ordreVitrine! - b.ordreVitrine!)
    );
  }

  async listPromotions(): Promise<Promotion[]> {
    return delay(mockPromotions);
  }

  async listAvailableTypes(): Promise<string[]> {
    return delay(deriveAvailableTypes(mockProducts));
  }

  async listAvailableSizes(): Promise<string[]> {
    return delay(deriveAvailableSizes(mockProducts));
  }
}
