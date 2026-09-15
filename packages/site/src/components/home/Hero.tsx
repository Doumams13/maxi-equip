import Link from "next/link";
import { siteConfig } from "@/config/site";
import { ShowroomWall } from "./ShowroomWall";
import type { ProductModel, Promotion } from "@/lib/types/catalog";

/**
 * Refonte — abandonne le gabarit "fond sombre + dégradé + eyebrow
 * MAJUSCULES" au profit d'une composition claire, asymétrique, où le
 * carrelage lui-même (pas un aplat de couleur) occupe le second temps
 * fort de l'écran. Le texte reste sur fond clair — l'autorité vient de
 * la typographie serif, pas d'un contraste sombre artificiel.
 */
export function Hero({
  featuredModels,
  promotions,
}: {
  featuredModels: ProductModel[];
  promotions: Promotion[];
}) {
  return (
    <section className="bg-stone-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-6">
        <div>
          <p className="font-display text-lg italic text-pine-700">{siteConfig.city}</p>
          <h1 className="mt-2 max-w-lg font-display text-4xl font-semibold leading-[1.05] text-stone-900 sm:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-stone-600">{siteConfig.description}</p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Link
              href="/catalogue"
              className="bg-pine-700 px-7 py-3.5 font-semibold text-stone-50 transition-colors hover:bg-pine-800"
            >
              Découvrir le catalogue
            </Link>
            <Link href="/contact" className="font-semibold text-stone-800 underline decoration-1 underline-offset-4 hover:text-pine-700">
              Nous contacter
            </Link>
          </div>
        </div>

        <ShowroomWall models={featuredModels} promotions={promotions} />
      </div>
    </section>
  );
}
