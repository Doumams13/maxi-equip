import type { ProductModel, Promotion } from "@/lib/types/catalog";

export interface CatalogFilters {
  search?: string;
  type?: string;
  size?: string;
  minPriceFcfa?: number;
  maxPriceFcfa?: number;
  onlyPromotions?: boolean;
}

export type CatalogSort =
  | "type_size"
  | "relevance"
  | "name_asc"
  | "recent";

/**
 * Tri par défaut du catalogue public : par type de carreau, puis par la plus
 * petite taille disponible au sein de chaque type (ex. Antidérapant 30x30,
 * 40x40… puis Faïence 30x30, 40x40…). Utilisé quand aucun paramètre `sort`
 * n'est présent dans l'URL — voir `src/app/catalogue/page.tsx`.
 */
export const DEFAULT_CATALOG_SORT: CatalogSort = "type_size";

/**
 * Contrat d'accès au catalogue public.
 *
 * RÈGLE D'ARCHITECTURE : le site ne doit jamais accéder directement à une
 * base de données. Cette interface est le SEUL point d'entrée que les pages
 * et composants sont autorisés à utiliser pour lire des produits ou des
 * promotions. Deux implémentations existent :
 *  - MockCatalogRepository (Phase 5, données isolées dans src/mock)
 *  - ApiCatalogRepository (à activer dès que l'API centrale /v1/public/...
 *    sera disponible — voir apiCatalogRepository.ts)
 * Le choix entre les deux se fait uniquement dans index.ts, jamais dans les
 * pages/composants, pour que la bascule mock → API n'impacte qu'un seul fichier.
 */
export interface CatalogRepository {
  listModels(filters: CatalogFilters, sort: CatalogSort): Promise<ProductModel[]>;
  getModelBySlug(slug: string): Promise<ProductModel | null>;
  listFeaturedModels(): Promise<ProductModel[]>;
  /**
   * Modèles sélectionnés manuellement pour la vitrine de l'accueil,
   * triés par `ordreVitrine` croissant (position 0 = premier) —
   * correction "choisir quels carreaux s'affichent en première page"
   * (2026-10-07). Distinct de `listFeaturedModels` ci-dessus (qui
   * reflète en réalité une promotion active, jamais une sélection
   * manuelle) — peut retourner une liste vide si rien n'a encore été
   * sélectionné depuis l'app.
   */
  listVitrineModels(): Promise<ProductModel[]>;
  listPromotions(): Promise<Promotion[]>;
  listAvailableTypes(): Promise<string[]>;
  listAvailableSizes(): Promise<string[]>;
}
