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
import { ScrollToHashOnLoad } from "@/components/catalogue/ScrollToHashOnLoad";
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
    /** Ancien paramètre de filtre (Défaut 2) — n'est plus jamais utilisé comme filtre, mais reconnu pour rediriger en douceur les anciens liens/favoris vers la bonne section plutôt que de les ignorer silencieusement (voir ScrollToHashOnLoad). */
    type?: string;
    size?: string;
    sort?: string;
    promo?: string;
  };
}

/**
 * Regroupe les modèles par type — TOUJOURS appliqué, quel que soit le tri
 * choisi (Défaut 2/5 : le catalogue reste une page unique structurée par
 * type, jamais un filtre qui fait disparaître les autres types). L'ordre
 * DES TYPES suit `types` (déjà trié alphabétiquement par
 * `listAvailableTypes()`), pour rester identique à l'ordre des boutons de
 * `FilterSidebar` — condition nécessaire pour qu'une ancre "type-X" pointe
 * toujours vers la bonne section, quel que soit le tri actif. L'ORDRE DES
 * MODÈLES à l'intérieur de chaque section respecte le tri choisi par
 * l'utilisateur (peu importe qu'ils soient adjacents ou non dans le
 * tableau reçu).
 */
function groupByType(models: ProductModel[], types: string[]): { type: string; models: ProductModel[] }[] {
  const parType = new Map<string, ProductModel[]>();
  for (const model of models) {
    const liste = parType.get(model.type) ?? [];
    liste.push(model);
    parType.set(model.type, liste);
  }
  return types
    .map((type) => ({ type, models: parType.get(type) ?? [] }))
    .filter((groupe) => groupe.models.length > 0);
}

export default async function CataloguePage({ searchParams }: CataloguePageProps) {
  const filters = {
    search: searchParams.search,
    size: searchParams.size,
    onlyPromotions: searchParams.promo === "1",
  };
  // Correction "Défaut 2" : le paramètre `type` n'est JAMAIS transmis comme
  // filtre — cliquer sur un type ne doit jamais faire disparaître les
  // autres (voir FilterSidebar.tsx, désormais une simple ancre de
  // défilement). `CatalogFilters.type` reste défini dans l'interface pour
  // un usage futur éventuel (ex. une page dédiée par type), mais la page
  // catalogue elle-même ne l'utilise plus jamais.
  const sort = (searchParams.sort as CatalogSort) ?? DEFAULT_CATALOG_SORT;

  try {
    const [models, promotions, types, sizes] = await Promise.all([
      catalogRepository.listModels(filters, sort),
      catalogRepository.listPromotions(),
      catalogRepository.listAvailableTypes(),
      catalogRepository.listAvailableSizes(),
    ]);

    const hasActiveFilters = Boolean(filters.search || filters.size || filters.onlyPromotions);

    // Toujours regroupé par type (Défaut 2/5) — jamais une liste plate,
    // pour que chaque section reste une ancre stable et navigable.
    const groups = groupByType(models, types);

    return (
      <div>
        <ScrollToHashOnLoad legacyTypeParam={searchParams.type} />
        <div className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Le catalogue</h1>
            <p className="mt-2 text-sm text-stone-500">
              {models.length} modèle{models.length > 1 ? "s" : ""} disponible{models.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-8">
            <Suspense fallback={<div className="h-11 w-full animate-pulse bg-stone-100" />}>
              <SearchBar />
            </Suspense>
          </div>

          <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
            <Suspense fallback={<div className="h-64 w-full animate-pulse bg-stone-100" />}>
              <FilterSidebar types={types} sizes={sizes} />
            </Suspense>

            <div>
              <div className="mb-6 flex items-center justify-end">
                <Suspense fallback={<div className="h-9 w-40 animate-pulse bg-stone-100" />}>
                  <SortSelect />
                </Suspense>
              </div>

              {models.length === 0 ? (
                <EmptyState
                  title="Aucun modèle ne correspond à votre recherche"
                  description="Essayez d'élargir vos filtres ou d'effacer votre recherche."
                  action={
                    hasActiveFilters ? (
                      <Link href="/catalogue" className="text-sm font-semibold text-pine-700 hover:underline">
                        Voir tout le catalogue
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-14">
                  {groups.map((group) => (
                    <section key={group.type} id={`type-${group.type}`} aria-labelledby={`type-titre-${group.type}`} className="scroll-mt-6">
                      <div className="mb-6 flex items-baseline gap-3 border-b border-stone-200 pb-3">
                        <h2 id={`type-titre-${group.type}`} className="font-display text-2xl text-stone-900">
                          {group.type}
                        </h2>
                        <span className="text-sm text-stone-400">{group.models.length}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                        {group.models.map((m) => (
                          <ProductCard key={m.id} model={m} promotions={promotions} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
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

