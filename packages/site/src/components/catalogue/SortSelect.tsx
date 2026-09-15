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
  const current = (searchParams.get("sort") as CatalogSort) ?? DEFAULT_CATALOG_SORT;

  return (
    <label className="flex items-center gap-2 text-sm text-ink/60">
      <span className="hidden sm:inline">Trier</span>
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("sort", e.target.value);
          window.location.href = `${pathname}?${params.toString()}`;
        }}
        className="border-0 border-b border-ink/30 bg-transparent py-1 font-display text-base italic text-ink focus:border-ember"
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
