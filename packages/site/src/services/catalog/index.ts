import { MockCatalogRepository } from "./mockCatalogRepository";
import { ApiCatalogRepository } from "./apiCatalogRepository";
import type { CatalogRepository } from "./CatalogRepository";

export type { CatalogFilters, CatalogSort, CatalogRepository } from "./CatalogRepository";
export { DEFAULT_CATALOG_SORT } from "./CatalogRepository";

/**
 * Point de bascule unique mock → API.
 *
 * Tant que NEXT_PUBLIC_API_BASE_URL n'est pas définie (cas de la Phase 5),
 * le site utilise exclusivement les données mockées. Le jour où l'API
 * centrale sera disponible, définir cette variable d'environnement suffira à
 * activer les vrais appels réseau, sans modifier une seule page ni un seul
 * composant — tous consomment l'interface CatalogRepository, jamais une
 * implémentation concrète directement.
 */
function createCatalogRepository(): CatalogRepository {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return new ApiCatalogRepository(apiBaseUrl);
  }
  return new MockCatalogRepository();
}

export const catalogRepository: CatalogRepository = createCatalogRepository();
