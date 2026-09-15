"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_CATALOG_SORT } from "@/services/catalog";
import type { CatalogSort } from "@/services/catalog";

const options: { value: CatalogSort; label: string }[] = [
  { value: "type_size", label: "Type et taille" },
  { value: "relevance", label: "Pertinence" },
  { value: "recent", label: "Plus récents" },
  { value: "name_asc", label: "Nom (A → Z)" },
];

export function SortSelect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Doit rester synchronisé avec le défaut appliqué côté page
  // (src/app/catalogue/page.tsx) quand aucun paramètre `sort` n'est présent
  // dans l'URL, pour que le sélecteur reflète toujours le tri réellement actif.
  const current = (searchParams.get("sort") as CatalogSort) ?? DEFAULT_CATALOG_SORT;

  return (
    <label className="flex items-center gap-2 text-sm text-stone-600">
      <span className="hidden sm:inline">Trier par</span>
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("sort", e.target.value);
          // Navigation "en dur" (pas router.replace/refresh) : voir le
          // commentaire détaillé dans FilterSidebar.tsx. Garantit que la
          // page /catalogue est entièrement rechargée avec le nouveau tri,
          // sans dépendre du Router Cache client de Next.js.
          window.location.href = `${pathname}?${params.toString()}`;
        }}
        className="border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 focus:border-pine-700"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

