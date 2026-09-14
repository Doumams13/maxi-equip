import { MockCatalogRepository } from "./mockCatalogRepository";
import type { CatalogRepository } from "./CatalogRepository";

export type { CatalogFilters, CatalogSort, CatalogRepository } from "./CatalogRepository";
export { DEFAULT_CATALOG_SORT } from "./CatalogRepository";

/**
 * Point de bascule mock -> API.
 *
 * Correction "Intégration Site Phase 5" — IMPORTANT : contrairement au
 * catalogue et aux localisations, `ApiCatalogRepository` reste
 * délibérément un squelette non implémenté. Le catalogue MAXI-EQUIP vit
 * dans la base locale de chaque installation Electron ; aucun
 * mécanisme de synchronisation catalogue -> serveur n'existe encore
 * (seule la synchronisation demande -> serveur -> application existe
 * réellement à ce stade, dans l'autre sens). Basculer ce repository sur
 * `NEXT_PUBLIC_API_BASE_URL` casserait entièrement le catalogue public
 * dès que cette variable serait définie pour activer l'envoi réel des
 * demandes (voir services/request/index.ts, désormais réellement
 * fonctionnel) — ces deux bascules sont donc VOLONTAIREMENT
 * indépendantes l'une de l'autre. Le catalogue reste mocké jusqu'à ce
 * qu'un vrai mécanisme de synchronisation catalogue soit construit
 * (hors périmètre de cette étape).
 */
function createCatalogRepository(): CatalogRepository {
  return new MockCatalogRepository();
}

export const catalogRepository: CatalogRepository = createCatalogRepository();
