import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { applyFiltersAndSort, deriveAvailableTypes, deriveAvailableSizes } from "./filterModels";
import type {
  CatalogFilters,
  CatalogRepository,
  CatalogSort,
} from "./CatalogRepository";

/**
 * Implémentation réelle — correction "Intégration Site Phase 5, Partie 3
 * (site réel)". Consomme :
 *  GET /v1/public/catalog/models — catalogue complet (modèles actifs,
 *  variantes, images) ;
 *  GET /v1/public/promotions — promotions déjà résolues par variante.
 *
 * Aucun filtrage/tri côté API : `applyFiltersAndSort` (extrait de
 * `mockCatalogRepository.ts`) reste l'UNIQUE implémentation de cette
 * logique, partagée entre mock et réel — jamais dupliquée.
 *
 * CACHE/SNAPSHOT (§7 du cahier des charges Phase 5) : deux niveaux —
 *  1. Le cache fetch natif de Next.js (`next.revalidate`), qui évite un
 *     appel réseau à chaque rendu tant que la donnée n'est pas périmée.
 *  2. Un instantané en mémoire, dans les variables de MODULE ci-dessous
 *     (`dernierModelesConnus`/`dernieresPromotionsConnues`), mis à jour à
 *     chaque succès et réutilisé UNIQUEMENT si un appel échoue.
 *
 * CE QUE CET INSTANTANÉ N'EST PAS — audit Phase 5, point 2 (précision
 * demandée) : ce n'est PAS un cache persistant. Il vit dans la mémoire
 * du processus Node EN COURS, jamais sur disque, jamais partagé entre
 * plusieurs instances/réplicas d'un déploiement. Comportement exact
 * selon le scénario :
 *  a) API indisponible APRÈS un premier succès (même processus) : le
 *     catalogue reste consultable avec la dernière donnée connue.
 *  b) API indisponible AVANT tout succès (processus tout juste démarré,
 *     ou réplica qui n'a encore jamais réussi un appel) : l'instantané
 *     est `null`, l'erreur remonte normalement — la page affiche son
 *     état d'erreur existant (voir app/catalogue/page.tsx), jamais une
 *     fausse donnée. Aucune "dernière donnée connue" à servir puisqu'il
 *     n'y en a jamais eu.
 *  c) Redémarrage de Next.js pendant que l'API est indisponible : les
 *     variables de module sont réinitialisées à `null` au redémarrage —
 *     ce cas est donc IDENTIQUE au scénario (b), jamais au scénario (a).
 *     L'instantané ne survit à aucun redémarrage, par construction.
 */

const REVALIDATE_SECONDES = 60;

let dernierModelesConnus: ProductModel[] | null = null;
let dernieresPromotionsConnues: Promotion[] | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDES } });
  if (!res.ok) {
    throw new Error(`Réponse inattendue de l'API MAXI EQUIP (${res.status}) pour ${url}.`);
  }
  return (await res.json()) as T;
}

export class ApiCatalogRepository implements CatalogRepository {
  constructor(private readonly baseUrl: string) {}

  private async chargerModeles(): Promise<ProductModel[]> {
    try {
      const corps = await fetchJson<{ models: ProductModel[] }>(`${this.baseUrl}/v1/public/catalog/models`);
      dernierModelesConnus = corps.models;
      return corps.models;
    } catch (err) {
      if (dernierModelesConnus) return dernierModelesConnus;
      throw err;
    }
  }

  private async chargerPromotions(): Promise<Promotion[]> {
    try {
      const corps = await fetchJson<{ promotions: Promotion[] }>(`${this.baseUrl}/v1/public/promotions`);
      dernieresPromotionsConnues = corps.promotions;
      return corps.promotions;
    } catch (err) {
      if (dernieresPromotionsConnues) return dernieresPromotionsConnues;
      throw err;
    }
  }

  async listModels(filters: CatalogFilters, sort: CatalogSort): Promise<ProductModel[]> {
    const [modeles, promotions] = await Promise.all([this.chargerModeles(), this.chargerPromotions()]);
    return applyFiltersAndSort(modeles, promotions, filters, sort);
  }

  async getModelBySlug(slug: string): Promise<ProductModel | null> {
    const modeles = await this.chargerModeles();
    return modeles.find((m) => m.slug === slug) ?? null;
  }

  async listFeaturedModels(): Promise<ProductModel[]> {
    const modeles = await this.chargerModeles();
    return modeles.filter((m) => m.featured);
  }

  async listPromotions(): Promise<Promotion[]> {
    return this.chargerPromotions();
  }

  async listAvailableTypes(): Promise<string[]> {
    return deriveAvailableTypes(await this.chargerModeles());
  }

  async listAvailableSizes(): Promise<string[]> {
    return deriveAvailableSizes(await this.chargerModeles());
  }
}
