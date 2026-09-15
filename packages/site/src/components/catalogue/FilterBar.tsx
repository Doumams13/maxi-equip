"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function FilterBar({ types, sizes }: { types: string[]; sizes: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSize = searchParams.get("size") ?? "";
  const onlyPromotions = searchParams.get("promo") === "1";

  function hrefFor(key: string, value: string | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function handleTypeClick(e: React.MouseEvent<HTMLAnchorElement>, type: string) {
    e.preventDefault();
    document.getElementById(`type-${type}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#type-${type}`);
  }

  function handleTousLesTypesClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", pathname);
  }

  const hasActiveFilters = Boolean(currentSize || onlyPromotions || searchParams.get("search"));

  return (
    <div className="border-t border-ink/15">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-6">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <a href={pathname} onClick={handleTousLesTypesClick} className="font-display text-lg italic text-ink/50 hover:text-ember">
            Tout
          </a>
          {types.map((type) => (
            <a key={type} href={`#type-${type}`} onClick={(e) => handleTypeClick(e, type)} className="font-display text-lg italic text-ink hover:text-ember">
              {type}
            </a>
          ))}
        </div>

        <span className="hidden h-5 w-px bg-ink/15 sm:block" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={hrefFor("size", null)}
            aria-current={currentSize === "" ? "true" : undefined}
            className={`border px-3 py-1 text-xs ${currentSize === "" ? "border-ink bg-ink text-paper" : "border-ink/25 text-ink/60 hover:border-ink"}`}
          >
            Toutes tailles
          </a>
          {sizes.map((size) => (
            <a
              key={size}
              href={hrefFor("size", size)}
              aria-current={currentSize === size ? "true" : undefined}
              className={`border px-3 py-1 text-xs ${currentSize === size ? "border-ink bg-ink text-paper" : "border-ink/25 text-ink/60 hover:border-ink"}`}
            >
              {size}
            </a>
          ))}
        </div>

        <span className="hidden h-5 w-px bg-ink/15 sm:block" aria-hidden="true" />

        <a
          href={hrefFor("promo", onlyPromotions ? null : "1")}
          aria-current={onlyPromotions ? "true" : undefined}
          className={`text-xs ${onlyPromotions ? "text-ember" : "text-ink/60 hover:text-ink"}`}
        >
          {onlyPromotions ? "✓ " : ""}Uniquement les promotions
        </a>

        {hasActiveFilters && (
          <a href={pathname} className="text-xs text-ink/40 underline hover:text-ink">
            Réinitialiser
          </a>
        )}
      </div>
    </div>
  );
}
