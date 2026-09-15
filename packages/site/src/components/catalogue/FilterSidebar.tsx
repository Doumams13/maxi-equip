"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * IMPORTANT — pourquoi ce composant navigue "en dur" (window.location)
 * pour la TAILLE et les PROMOTIONS (restés de vrais filtres) :
 *
 * En pratique, `router.replace()` (même suivi de `router.refresh()`) peut
 * laisser le Router Cache côté client de Next.js réafficher une liste de
 * produits déjà visitée quand seuls les paramètres de recherche changent sur
 * la même route (`/catalogue`) : l'URL et l'état visuel des boutons
 * (`aria-pressed`) se mettent à jour, mais la grille de produits reste celle
 * de la requête précédente. C'est un problème connu de mise en cache du
 * routeur applicatif de Next.js, pas une erreur de logique de filtrage
 * (celle-ci a été vérifiée indépendamment et fonctionne correctement).
 *
 * Chaque filtre est donc un vrai lien (`<a href>`), qui déclenche une
 * navigation complète du navigateur : le Server Component de /catalogue est
 * ré-exécuté à chaque clic, sans aucune ambiguïté de cache possible. Le
 * panier n'est pas affecté (il est relu depuis localStorage à chaque
 * chargement de page, voir CartContext).
 *
 * CORRECTION "Défaut 2" — le TYPE n'est plus un filtre du tout : cliquer
 * sur un type ne modifie jamais l'URL de recherche ni la liste affichée,
 * il fait uniquement défiler la page jusqu'à la section correspondante
 * (voir handleTypeClick). Toujours toutes les sections restent visibles.
 */
export function FilterSidebar({
  types,
  sizes,
}: {
  types: string[];
  sizes: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSize = searchParams.get("size") ?? "";
  const onlyPromotions = searchParams.get("promo") === "1";

  function hrefFor(key: string, value: string | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
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
    <aside className="space-y-6" aria-label="Filtres du catalogue">
      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-500">
          Type
        </h2>
        <p className="mt-1 text-xs text-ink-400">Vous amène directement à la section correspondante.</p>
        <ul className="mt-2 space-y-1">
          <li>
            <a
              href={pathname}
              onClick={handleTousLesTypesClick}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-600 hover:bg-ink-50"
            >
              Tous les types
            </a>
          </li>
          {types.map((type) => (
            <li key={type}>
              <a
                href={`#type-${type}`}
                onClick={(e) => handleTypeClick(e, type)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-600 hover:bg-ink-50"
              >
                {type}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-500">
          Taille
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={hrefFor("size", null)}
            aria-current={currentSize === "" ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              currentSize === "" ? "border-green-600 bg-green-50 text-green-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
            }`}
          >
            Toutes
          </a>
          {sizes.map((size) => (
            <a
              key={size}
              href={hrefFor("size", size)}
              aria-current={currentSize === size ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                currentSize === size ? "border-green-600 bg-green-50 text-green-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
              }`}
            >
              {size}
            </a>
          ))}
        </div>
      </div>

      <div>
        <a
          href={hrefFor("promo", onlyPromotions ? null : "1")}
          aria-current={onlyPromotions ? "true" : undefined}
          className="flex items-center gap-2 text-sm text-ink-700"
        >
          <span
            aria-hidden="true"
            className={`flex h-4 w-4 items-center justify-center rounded border ${
              onlyPromotions ? "border-green-600 bg-green-600 text-white" : "border-ink-300 bg-white"
            }`}
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

      {hasActiveFilters && (
        <a
          href={pathname}
          className="inline-block text-sm font-semibold text-ink-500 underline hover:text-ink-700"
        >
          Effacer les filtres
        </a>
      )}
    </aside>
  );
}
