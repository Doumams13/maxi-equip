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
      if (value) params.set("search", value);
      else params.delete("search");
      const nextUrl = `${pathname}?${params.toString()}`;
      const currentUrl = `${pathname}?${searchParams.toString()}`;
      if (nextUrl === currentUrl) return;
      window.location.href = nextUrl;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="block">
      <span className="sr-only">Rechercher un modèle, un type ou une référence</span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Chercher un motif, un type, une référence…"
        className="w-full border-0 border-b border-ink/25 bg-transparent py-3 font-display text-2xl italic text-ink placeholder:text-ink/35 focus:border-ember sm:text-3xl"
      />
    </label>
  );
}
