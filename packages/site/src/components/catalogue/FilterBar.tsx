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

  function handleTousClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", pathname);
  }

  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[12.5px] ${active ? "border-forest bg-forest text-bg" : "border-ink/[0.14] bg-surface text-ink-mute"}`;

  return (
    <div className="mt-4.5 flex flex-wrap gap-2">
      <a href={pathname} onClick={handleTousClick} className={pill(false)}>
        Tous
      </a>
      {types.map((type) => (
        <a key={type} href={`#type-${type}`} onClick={(e) => handleTypeClick(e, type)} className={pill(false)}>
          {type}
        </a>
      ))}
      <a href={hrefFor("size", null)} aria-current={currentSize === "" ? "true" : undefined} className={pill(currentSize === "")}>
        Toutes tailles
      </a>
      {sizes.map((size) => (
        <a key={size} href={hrefFor("size", size)} aria-current={currentSize === size ? "true" : undefined} className={pill(currentSize === size)}>
          {size}
        </a>
      ))}
      <a href={hrefFor("promo", onlyPromotions ? null : "1")} aria-current={onlyPromotions ? "true" : undefined} className={pill(onlyPromotions)}>
        Promotions
      </a>
    </div>
  );
}
