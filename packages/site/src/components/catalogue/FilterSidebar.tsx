"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * Colonne de filtres à gauche — remplace la barre horizontale de
 * pastilles. CHANGEMENT DE COMPORTEMENT ASSUMÉ ET VALIDÉ avec
 * l'utilisateur : le TYPE redevient un vrai filtre (retire les autres
 * types de la grille), contrairement à la correction précédente où il
 * s'agissait d'une simple ancre de défilement — nécessaire puisque la
 * grille est désormais unique et continue (plus de sections par type
 * vers lesquelles défiler). Navigation par vrais liens (jamais de
 * useRouter().replace()) pour éviter le problème de cache du routeur
 * Next.js déjà documenté par ailleurs dans ce projet.
 */
export function FilterSidebar({ types, sizes }: { types: string[]; sizes: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentType = searchParams.get("type") ?? "";
  const currentSize = searchParams.get("size") ?? "";
  const onlyPromotions = searchParams.get("promo") === "1";

  function hrefFor(key: string, value: string | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const item = (active: boolean) =>
    `block w-full py-1.5 text-left text-[13.5px] ${active ? "font-semibold text-forest-deep" : "text-ink-mute hover:text-ink"}`;

  return (
    <aside className="space-y-8">
      <div>
        <h2 className="mb-3 font-display text-base text-ink">Type</h2>
        <ul>
          <li>
            <a href={hrefFor("type", null)} aria-current={currentType === "" ? "true" : undefined} className={item(currentType === "")}>
              Tous
            </a>
          </li>
          {types.map((type) => (
            <li key={type}>
              <a href={hrefFor("type", type)} aria-current={currentType === type ? "true" : undefined} className={item(currentType === type)}>
                {type}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-3 font-display text-base text-ink">Format</h2>
        <ul>
          <li>
            <a href={hrefFor("size", null)} aria-current={currentSize === "" ? "true" : undefined} className={item(currentSize === "")}>
              Tous les formats
            </a>
          </li>
          {sizes.map((size) => (
            <li key={size}>
              <a href={hrefFor("size", size)} aria-current={currentSize === size ? "true" : undefined} className={item(currentSize === size)}>
                {size}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-ink/[0.08] pt-5">
        <a
          href={hrefFor("promo", onlyPromotions ? null : "1")}
          aria-current={onlyPromotions ? "true" : undefined}
          className="flex items-center gap-2.5 text-[13.5px] text-ink"
        >
          <span
            aria-hidden="true"
            className={`flex h-4 w-4 items-center justify-center border ${onlyPromotions ? "border-forest bg-forest text-white" : "border-ink/[0.25] bg-surface"}`}
          >
            {onlyPromotions && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          Uniquement les promotions
        </a>
      </div>
    </aside>
  );
}
