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
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ScrollToHashOnLoad legacyTypeParam={searchParams.type} />
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
            ) : (
              <div className="space-y-10">
                {groups.map((group) => (
                  <section key={group.type} id={`type-${group.type}`} aria-labelledby={`type-titre-${group.type}`} className="scroll-mt-4">
                    <h2
                      id={`type-titre-${group.type}`}
                      className="mb-4 border-b border-ink-100 pb-2 font-display text-lg font-bold text-ink-800"
                    >
                      {group.type}
                      <span className="ml-2 text-sm font-normal text-ink-400">({group.models.length})</span>
                    </h2>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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

