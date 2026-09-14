import Link from "next/link";
import { siteConfig } from "@/config/site";
import { HeroCatalogSample } from "./HeroCatalogSample";
import type { ProductModel, Promotion } from "@/lib/types/catalog";

/**
 * Disposition : une grille à une seule colonne sur mobile (le texte du Hero
 * reste prioritaire, l'échantillon catalogue suit en dessous dans l'ordre du
 * DOM), qui devient deux colonnes à partir de `lg` (texte à gauche, aperçu du
 * catalogue à droite). Voir `HeroCatalogSample` pour le contenu de droite.
 */
export function Hero({
  featuredModels,
  promotions,
}: {
  featuredModels: ProductModel[];
  promotions: Promotion[];
}) {
  return (
    <section className="relative overflow-hidden bg-ink-800 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-green-900/90 via-ink-800 to-ink-900" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
          <div>
            <p className="font-display text-sm font-semibold uppercase tracking-widest text-green-300">
              {siteConfig.city}
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-5xl">
              {siteConfig.tagline}
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink-200 sm:text-lg">
              {siteConfig.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/catalogue"
                className="rounded-md bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500"
              >
                Voir le catalogue
              </Link>
              <Link
                href="/contact"
                className="rounded-md border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10"
              >
                Nous contacter
              </Link>
            </div>
            <p className="mt-10 font-display text-sm italic text-green-200">
              “{siteConfig.slogan}”
            </p>
          </div>

          <HeroCatalogSample models={featuredModels} promotions={promotions} />
        </div>
      </div>
    </section>
  );
}
