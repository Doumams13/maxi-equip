"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function SearchBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      const nextUrl = `${pathname}?${params.toString()}`;
      // N'effectue la navigation que si la recherche a réellement changé,
      // pour ne pas recharger la page à chaque frappe sans raison.
      const currentUrl = `${pathname}?${searchParams.toString()}`;
      if (nextUrl === currentUrl) return;
      // Navigation "en dur" (pas router.replace) : voir le commentaire
      // détaillé dans FilterSidebar.tsx — garantit un résultat de recherche
      // toujours à jour, sans dépendre du Router Cache client de Next.js.
      window.location.href = nextUrl;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="block">
      <span className="sr-only">Rechercher un modèle, un type ou une référence</span>
      <div className="relative">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Rechercher un modèle, un type, une référence…"
          className="w-full border border-stone-300 py-2.5 pl-10 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-pine-700"
        />
      </div>
    </label>
  );
}
