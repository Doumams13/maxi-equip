import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { catalogRepository, DEFAULT_CATALOG_SORT } from "@/services/catalog";
import type { CatalogSort } from "@/services/catalog";
import type { ProductModel } from "@/lib/types/catalog";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { FilterBar } from "@/components/catalogue/FilterBar";
import { SortSelect } from "@/components/catalogue/SortSelect";
import { SearchBar } from "@/components/catalogue/SearchBar";
import { ScrollToHashOnLoad } from "@/components/catalogue/ScrollToHashOnLoad";
import { EmptyState, ErrorState } from "@/components/ui/states";

export const metadata: Metadata = {
  title: "Catalogue de carreaux",
  description: "Parcourez le catalogue de carreaux MAXI EQUIP : faïence, grès cérame, mosaïque et antidérapant, dans toutes les tailles disponibles.",
};

export const dynamic = "force-dynamic";

interface CataloguePageProps {
  searchParams: { search?: string; type?: string; size?: string; sort?: string; promo?: string };
}

function groupByType(models: ProductModel[], types: string[]): { type: string; models: ProductModel[] }[] {
  const parType = new Map<string, ProductModel[]>();
  for (const model of models) {
    const liste = parType.get(model.type) ?? [];
    liste.push(model);
    parType.set(model.type, liste);
  }
  return types.map((type) => ({ type, models: parType.get(type) ?? [] })).filter((g) => g.models.length > 0);
}

export default async function CataloguePage({ searchParams }: CataloguePageProps) {
  const filters = { search: searchParams.search, size: searchParams.size, onlyPromotions: searchParams.promo === "1" };
  const sort = (searchParams.sort as CatalogSort) ?? DEFAULT_CATALOG_SORT;

  try {
    const [models, promotions, types, sizes] = await Promise.all([
      catalogRepository.listModels(filters, sort),
      catalogRepository.listPromotions(),
      catalogRepository.listAvailableTypes(),
      catalogRepository.listAvailableSizes(),
    ]);

    const hasActiveFilters = Boolean(filters.search || filters.size || filters.onlyPromotions);
    const groups = groupByType(models, types);

    return (
      <div>
        <ScrollToHashOnLoad legacyTypeParam={searchParams.type} />

        <div className="mx-auto max-w-[1400px] px-5 pt-16 sm:px-10">
          <p className="font-display text-lg italic text-ink/50">
            {models.length} modèle{models.length > 1 ? "s" : ""}
          </p>
          <h1 className="mt-1 font-display text-display-1 italic leading-none text-ink">Le catalogue</h1>

          <div className="mt-10">
            <Suspense fallback={<div className="h-12 w-full animate-pulse bg-ink/5" />}>
              <SearchBar />
            </Suspense>
          </div>

          <Suspense fallback={<div className="mt-6 h-14 w-full animate-pulse bg-ink/5" />}>
            <FilterBar types={types} sizes={sizes} />
          </Suspense>

          <div className="flex justify-end border-b border-ink/15 pb-6">
            <Suspense fallback={<div className="h-9 w-40 animate-pulse bg-ink/5" />}>
              <SortSelect />
            </Suspense>
          </div>
        </div>

        <div className="mx-auto max-w-[1400px] px-5 sm:px-10">
          {models.length === 0 ? (
            <EmptyState
              title="Rien à montrer ici"
              description="Essayez d'élargir vos filtres ou d'effacer votre recherche."
              action={
                hasActiveFilters ? (
                  <Link href="/catalogue" className="font-display text-lg italic text-ember hover:underline">
                    Voir tout le catalogue
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="py-16">
              {groups.map((group, gi) => (
                <section
                  key={group.type}
                  id={`type-${group.type}`}
                  aria-labelledby={`type-titre-${group.type}`}
                  className="scroll-mt-6 border-b border-ink/15 py-16 first:pt-0 last:border-0"
                >
                  <div className="mb-10 flex items-baseline gap-4">
                    <span className="font-display text-lg italic text-ink/30">0{gi + 1}</span>
                    <h2 id={`type-titre-${group.type}`} className="font-display text-display-2 italic leading-none text-ink">
                      {group.type}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
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
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger le catalogue pour le moment."} />
      </div>
    );
  }
}
