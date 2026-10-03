import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogueContent } from "./CatalogueContent";
import { LoadingGrid } from "@/components/ui/states";

const TITRE_CATALOGUE = "Catalogue de carreaux";
const DESCRIPTION_CATALOGUE =
  "Parcourez l'ensemble des modèles de carreaux disponibles chez MAXI EQUIP à Libreville : faïence, grès cérame, mosaïque et antidérapant, dans tous les formats.";

export const metadata: Metadata = {
  title: TITRE_CATALOGUE,
  description: DESCRIPTION_CATALOGUE,
  // Canonique fixe vers /catalogue (sans les paramètres de recherche/tri/
  // filtre) — évite que Google indexe séparément chaque combinaison de
  // filtres comme une page distincte (contenu dupliqué, §4 du cahier des
  // charges SEO).
  alternates: { canonical: "/catalogue" },
  openGraph: { title: TITRE_CATALOGUE, description: DESCRIPTION_CATALOGUE },
  twitter: { title: TITRE_CATALOGUE, description: DESCRIPTION_CATALOGUE },
};

export const dynamic = "force-dynamic";

interface CataloguePageProps {
  searchParams: { search?: string; type?: string; size?: string; sort?: string; promo?: string };
}

/**
 * Correction "corrections finales SEO", §1 — page volontairement réduite
 * à une frontière `<Suspense>` locale autour de `CatalogueContent`
 * (l'UX de chargement identique à l'ancien `loading.tsx`, désormais
 * supprimé). Voir CatalogueContent.tsx pour l'explication complète : un
 * `loading.tsx` de dossier empêchait la route voisine
 * `catalogue/[modelSlug]` de renvoyer un vrai statut HTTP 404.
 */
export default function CataloguePage({ searchParams }: CataloguePageProps) {
  return (
    <Suspense fallback={<LoadingCatalogue />}>
      <CatalogueContent searchParams={searchParams} />
    </Suspense>
  );
}

function LoadingCatalogue() {
  return (
    <div className="mx-auto max-w-[1320px] px-[18px] py-16 sm:px-7">
      <div className="mb-8 h-10 w-48 animate-pulse rounded bg-surface-soft" />
      <LoadingGrid count={8} />
    </div>
  );
}
