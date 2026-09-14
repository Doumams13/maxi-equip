import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { catalogRepository, DEFAULT_CATALOG_SORT } from "@/services/catalog";
import type { CatalogSort } from "@/services/catalog";
import type { ProductModel } from "@/lib/types/catalog";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { FilterSidebar } from "@/components/catalogue/FilterSidebar";
import { SortSelect } from "@/components/catalogue/SortSelect";
import { SearchBar } from "@/components/catalogue/SearchBar";
import { EmptyState, ErrorState } from "@/components/ui/states";

export const metadata: Metadata = {
  title: "Catalogue de carreaux",
  description: "Parcourez le catalogue de carreaux MAXI EQUIP : faïence, grès cérame, mosaïque et antidérapant, dans toutes les tailles disponibles.",
};

// Force un rendu dynamique à chaque requête : cette page dépend entièrement
// des paramètres de recherche (filtres, tri), qui ne doivent jamais être
// servis depuis un cache statique ou une revalidation programmée.
export const dynamic = "force-dynamic";

interface CataloguePageProps {
  searchParams: {
    search?: string;
    type?: string;
    size?: string;
    sort?: string;
    promo?: string;
  };
}

/**
 * Regroupe une liste déjà triée par type (voir MockCatalogRepository, cas
 * "type_size") en sections consécutives, pour un AFFICHAGE explicite du
 * classement "par type puis par taille" — sans quoi le tri, bien que
 * correct côté données, reste invisible dans une grille uniforme.
 * Suppose que `models` est déjà trié par type ; ne re-trie rien lui-même.
 */
function groupByType(models: ProductModel[]): { type: string; models: ProductModel[] }[] {
  const groups: { type: string; models: ProductModel[] }[] = [];
  for (const model of models) {
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.type === model.type) {
      currentGroup.models.push(model);
    } else {
      groups.push({ type: model.type, models: [model] });
    }
  }
  return groups;
}

export default async function CataloguePage({ searchParams }: CataloguePageProps) {
  const filters = {
    search: searchParams.search,
    type: searchParams.type,
    size: searchParams.size,
    onlyPromotions: searchParams.promo === "1",
  };
  // Tri par défaut : type puis taille (voir DEFAULT_CATALOG_SORT). Le tri
  // s'applique toujours APRÈS les filtres (recherche, type, taille, prix,
  // promotions), lesquels sont appliqués en amont dans listModels().
  const sort = (searchParams.sort as CatalogSort) ?? DEFAULT_CATALOG_SORT;

  try {
    const [models, promotions, types, sizes] = await Promise.all([
      catalogRepository.listModels(filters, sort),
      catalogRepository.listPromotions(),
      catalogRepository.listAvailableTypes(),
      catalogRepository.listAvailableSizes(),
    ]);

    const hasActiveFilters = Boolean(
      filters.search || filters.type || filters.size || filters.onlyPromotions
    );

    // On ne regroupe visuellement par type que pour le tri "Type et taille" :
    // pour les autres tris (prix, nom, récence…) un regroupement par type
    // n'aurait pas de sens et casserait l'ordre demandé par l'utilisateur.
    const groups = sort === "type_size" ? groupByType(models) : null;

    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-ink-800 sm:text-3xl">Catalogue</h1>
        <p className="mt-1 text-sm text-ink-500">
          {models.length} modèle{models.length > 1 ? "s" : ""} disponible{models.length > 1 ? "s" : ""}
        </p>

        <div className="mt-6 mb-6">
          <Suspense fallback={<div className="h-11 w-full animate-pulse rounded-md bg-ink-100" />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-md bg-ink-100" />}>
            <FilterSidebar types={types} sizes={sizes} />
          </Suspense>

          <div>
            <div className="mb-4 flex items-center justify-end">
              <Suspense fallback={<div className="h-9 w-40 animate-pulse rounded-md bg-ink-100" />}>
                <SortSelect />
              </Suspense>
            </div>

            {models.length === 0 ? (
              <EmptyState
                title="Aucun modèle ne correspond à votre recherche"
                description="Essayez d'élargir vos filtres ou d'effacer votre recherche."
                action={
                  hasActiveFilters ? (
                    <Link href="/catalogue" className="text-sm font-semibold text-green-700 hover:underline">
                      Voir tout le catalogue
                    </Link>
                  ) : undefined
                }
              />
            ) : groups ? (
              <div className="space-y-10">
                {groups.map((group) => (
                  <section key={group.type} aria-labelledby={`type-${group.type}`}>
                    <h2
                      id={`type-${group.type}`}
                      className="mb-4 border-b border-ink-100 pb-2 font-display text-lg font-bold text-ink-800"
                    >
                      {group.type}
                      <span className="ml-2 text-sm font-normal text-ink-400">
                        ({group.models.length})
                      </span>
                    </h2>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {group.models.map((m) => (
                        <ProductCard key={m.id} model={m} promotions={promotions} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {models.map((m) => (
                  <ProductCard key={m.id} model={m} promotions={promotions} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <ErrorState
          description={
            error instanceof Error
              ? error.message
              : "Impossible de charger le catalogue pour le moment."
          }
        />
      </div>
    );
  }
}

