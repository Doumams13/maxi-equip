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
  description: "Parcourez l'ensemble des modèles de carreaux disponibles chez MAXI EQUIP : faïence, grès cérame, mosaïque et antidérapant.",
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

        <div className="mx-auto max-w-[1320px] px-[18px] pt-8 sm:px-7">
          <h1 className="font-display text-[clamp(24px,4vw,42px)] text-forest-deep">Catalogue</h1>
          <p className="mt-2.5 max-w-[52ch] text-[14.5px] text-ink-mute">
            Parcourez l&apos;ensemble des modèles disponibles chez MAXI EQUIP. Filtrez par univers ou par format pour affiner votre recherche.
          </p>
          <div className="mt-5 max-w-md">
            <Suspense fallback={<div className="h-11 w-full animate-pulse rounded bg-surface-soft" />}>
              <SearchBar />
            </Suspense>
          </div>
          <Suspense fallback={<div className="mt-4.5 h-8 w-full animate-pulse rounded bg-surface-soft" />}>
            <FilterBar
              types={types}
              sizes={sizes}
              trailingSlot={
                <Suspense fallback={<div className="h-8 w-32 animate-pulse rounded bg-surface-soft" />}>
                  <SortSelect />
                </Suspense>
              }
            />
          </Suspense>
        </div>

        <div className="mx-auto max-w-[1320px] px-[18px] pb-16 pt-6 sm:px-7">
          {models.length === 0 ? (
            <EmptyState
              title="Aucun modèle ne correspond à votre recherche"
              description="Essayez d'élargir vos filtres ou d'effacer votre recherche."
              action={
                hasActiveFilters ? (
                  <Link href="/catalogue" className="text-sm font-semibold text-forest hover:underline">
                    Voir tout le catalogue
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-14">
              {groups.map((group) => (
                <section key={group.type} id={`type-${group.type}`} aria-labelledby={`type-titre-${group.type}`} className="scroll-mt-6">
                  <h2 id={`type-titre-${group.type}`} className="mb-5 border-b border-ink/[0.08] pb-3 font-display text-2xl text-forest-deep">
                    {group.type} <span className="text-base font-normal text-ink-mute">({group.models.length})</span>
                  </h2>
                  <div className="grid grid-cols-2 gap-x-3.5 gap-y-4 sm:grid-cols-3 sm:gap-x-4.5 sm:gap-y-5.5 lg:grid-cols-4 lg:gap-x-5.5 lg:gap-y-6.5">
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
      <div className="mx-auto max-w-[1320px] px-[18px] py-20 sm:px-7">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger le catalogue pour le moment."} />
      </div>
    );
  }
}
