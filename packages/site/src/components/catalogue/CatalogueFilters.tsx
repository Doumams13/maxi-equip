"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FilterSidebar } from "./FilterSidebar";

/**
 * Filtres du catalogue — colonne fixe sur desktop (≥lg), panneau
 * coulissant depuis la gauche sur mobile/tablette (Option B, choisie
 * par l'utilisateur après comparaison visuelle avec l'Option A —
 * tiroir depuis le bas). Réutilise FilterSidebar tel quel dans les deux
 * cas : aucune logique de filtrage dupliquée, seule la présentation
 * change selon la largeur d'écran.
 */
export function CatalogueFilters({ types, sizes }: { types: string[]; sizes: string[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="hidden lg:block">
        <FilterSidebar types={types} sizes={sizes} />
      </div>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="panneau-filtres-mobile"
          className="inline-flex items-center gap-2 rounded border border-ink/[0.14] px-4 py-2.5 text-[13.5px] font-medium text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          Filtres
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fermer les filtres" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div
            id="panneau-filtres-mobile"
            role="dialog"
            aria-modal="true"
            aria-label="Filtres"
            className="absolute inset-y-0 left-0 w-[82%] max-w-[320px] overflow-y-auto bg-bg p-6 shadow-[4px_0_16px_rgba(20,18,15,0.18)]"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-lg text-ink">Filtres</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="p-1 text-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <FilterSidebar types={types} sizes={sizes} />
          </div>
        </div>
      )}
    </>
  );
}
