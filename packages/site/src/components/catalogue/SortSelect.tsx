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
    <label className="flex items-center gap-2 text-[13px] text-ink-mute">
      Trier
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("sort", e.target.value);
          window.location.href = `${pathname}?${params.toString()}`;
        }}
        className="rounded border border-ink/[0.14] bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-forest"
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
