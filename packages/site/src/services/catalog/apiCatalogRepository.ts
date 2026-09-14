import type { ProductModel, Promotion } from "@/lib/types/catalog";
import type {
  CatalogFilters,
  CatalogRepository,
  CatalogSort,
} from "./CatalogRepository";

/**
 * Implémentation destinée à l'API centrale MAXI EQUIP.
 *
 * NON UTILISÉE EN PHASE 5 : ce squelette documente le contrat attendu côté
 * API (/v1/public/...) conformément à la Synthèse d'architecture (étape 5 :
 * "Tous les points d'entrée sont préfixés dès la V1 (/v1/…)") sans en
 * implémenter la logique réelle — il n'y a pas d'API à appeler pour cette
 * phase. À compléter lors de l'intégration réelle, sans changer l'interface
 * CatalogRepository ni aucun composant qui la consomme.
 *
 * Points d'entrée anticipés (à confirmer avec l'équipe API) :
 *  GET /v1/public/catalog/models?search=&type=&size=&sort=&onlyPromotions=
 *  GET /v1/public/catalog/models/:slug
 *  GET /v1/public/catalog/models/featured
 *  GET /v1/public/promotions/active
 *  GET /v1/public/catalog/facets (types, tailles disponibles)
 */
export class ApiCatalogRepository implements CatalogRepository {
  constructor(private readonly baseUrl: string) {}

  private notImplemented(endpoint: string): never {
    throw new Error(
      `ApiCatalogRepository.${endpoint} n'est pas implémenté : l'API centrale MAXI EQUIP ` +
        `n'est pas encore disponible pour cette phase (voir docs/RAPPORT_PHASE5.md). ` +
        `baseUrl configurée : ${this.baseUrl || "(aucune)"}`
    );
  }

  listModels(_filters: CatalogFilters, _sort: CatalogSort): Promise<ProductModel[]> {
    this.notImplemented("listModels");
  }

  getModelBySlug(_slug: string): Promise<ProductModel | null> {
    this.notImplemented("getModelBySlug");
  }

  listFeaturedModels(): Promise<ProductModel[]> {
    this.notImplemented("listFeaturedModels");
  }

  listPromotions(): Promise<Promotion[]> {
    this.notImplemented("listPromotions");
  }

  listAvailableTypes(): Promise<string[]> {
    this.notImplemented("listAvailableTypes");
  }

  listAvailableSizes(): Promise<string[]> {
    this.notImplemented("listAvailableSizes");
  }
}
