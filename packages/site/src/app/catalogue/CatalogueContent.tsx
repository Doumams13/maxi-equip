import Link from "next/link";
import { catalogRepository, DEFAULT_CATALOG_SORT } from "@/services/catalog";
import type { CatalogSort } from "@/services/catalog";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { CatalogueFilters } from "@/components/catalogue/CatalogueFilters";
import { SortSelect } from "@/components/catalogue/SortSelect";
import { SearchBar } from "@/components/catalogue/SearchBar";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Suspense } from "react";

interface CatalogueContentProps {
  searchParams: { search?: string; type?: string; size?: string; sort?: string; promo?: string };
}

/**
 * Contenu réel du catalogue — extrait de `page.tsx` (Correction §1,
 * "corrections finales SEO") pour que sa récupération de données reste
 * derrière une frontière `<Suspense>` PROPRE À CETTE PAGE, jamais un
 * `loading.tsx` de dossier. Un `loading.tsx` placé dans `catalogue/`
 * enveloppe aussi la route dynamique voisine `catalogue/[modelSlug]`
 * (convention Next.js : un fichier `loading.tsx` s'applique à la mise en
 * page du segment ET à tout ce qui s'y trouve, y compris les routes
 * imbriquées) — c'est exactement ce qui empêchait `notFound()` de
 * produire un vrai statut HTTP 404 sur une fiche produit inexistante (le
 * contenu de secours du catalogue partait déjà avec un 200 avant que la
 * page produit n'ait fini de résoudre). Un `<Suspense>` utilisé
 * directement à l'intérieur du composant de cette page reste local à son
 * propre arbre de rendu et ne peut plus affecter une route voisine.
 */
export async function CatalogueContent({ searchParams }: CatalogueContentProps) {
  const filters = {
    search: searchParams.search,
    type: searchParams.type,
    size: searchParams.size,
    onlyPromotions: searchParams.promo === "1",
  };
  const sort = (searchParams.sort as CatalogSort) ?? DEFAULT_CATALOG_SORT;

  try {
    const [models, promotions, types, sizes] = await Promise.all([
      catalogRepository.listModels(filters, sort),
      catalogRepository.listPromotions(),
      catalogRepository.listAvailableTypes(),
      catalogRepository.listAvailableSizes(),
    ]);

    const hasActiveFilters = Boolean(filters.search || filters.type || filters.size || filters.onlyPromotions);

    return (
      <div className="mx-auto max-w-[1320px] px-5 pb-16 pt-8 sm:px-7">
        <h1 className="font-display text-[clamp(24px,4vw,42px)] text-forest-deep">Catalogue</h1>
        <p className="mt-3 max-w-[52ch] text-[14.5px] text-ink-mute sm:mt-2.5">
          Parcourez l&apos;ensemble des modèles disponibles chez MAXI EQUIP. Filtrez par univers ou par format pour affiner votre recherche.
        </p>
        <div className="mt-6 max-w-md sm:mt-5">
          <Suspense fallback={<div className="h-11 w-full animate-pulse rounded bg-surface-soft" />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className="mt-9 grid gap-10 lg:grid-cols-[200px_1fr]">
          <Suspense fallback={<div className="h-64 w-full animate-pulse rounded bg-surface-soft" />}>
            <CatalogueFilters types={types} sizes={sizes} />
          </Suspense>

          <div>
            <div className="mb-6 flex justify-end">
              <Suspense fallback={<div className="h-8 w-32 animate-pulse rounded bg-surface-soft" />}>
                <SortSelect />
              </Suspense>
            </div>

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
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-4.5 sm:gap-y-5.5 lg:grid-cols-4 lg:gap-x-5.5 lg:gap-y-6.5">
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
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger le catalogue pour le moment."} />
      </div>
    );
  }
}
