import { MockCatalogRepository } from "./mockCatalogRepository";
import { ApiCatalogRepository } from "./apiCatalogRepository";
import type { CatalogRepository } from "./CatalogRepository";

export type { CatalogFilters, CatalogSort, CatalogRepository } from "./CatalogRepository";
export { DEFAULT_CATALOG_SORT } from "./CatalogRepository";

/**
 * Point de bascule mock -> API.
 *
 * Correction "Intégration Site Phase 5, Partie 2/3" : le pipeline de
 * synchronisation catalogue (Electron -> outbox -> API -> projection
 * serveur) existe désormais réellement (voir
 * packages/api/src/core/catalogStore.ts et
 * packages/electron-app/src/main/ipc/metier.ts). `ApiCatalogRepository`
 * n'est plus un squelette : cette bascule est maintenant active dès que
 * `NEXT_PUBLIC_API_BASE_URL` est définie, exactement comme pour les
 * demandes (services/request/index.ts) — un seul et même interrupteur
 * pour toute l'intégration réelle du site.
 */
function createCatalogRepository(): CatalogRepository {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return new ApiCatalogRepository(apiBaseUrl);
  }
  return new MockCatalogRepository();
}

export const catalogRepository: CatalogRepository = createCatalogRepository();
