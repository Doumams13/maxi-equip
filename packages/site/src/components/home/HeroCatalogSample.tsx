import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { DiscountBadge } from "@/components/ui/primitives";

const MAX_PRODUCT_TILES = 3;

/**
 * Échantillon visuel du catalogue affiché dans le Hero, sous forme de grille
 * de vignettes CARRÉES (2 colonnes), chacune cliquable vers la fiche produit
 * correspondante (/catalogue/[modelSlug]).
 *
 * Ne récupère AUCUNE donnée lui-même : il reçoit les modèles `featured` et
 * les promotions déjà chargés une seule fois par la page d'accueil (voir
 * src/app/page.tsx), pour ne jamais dupliquer l'appel à
 * `catalogRepository.listFeaturedModels()`. Le pourcentage de réduction
 * réutilise `getModelDisplayPrice` (src/lib/pricing.ts) — la même fonction
 * que `ProductCard` — pour rester cohérent avec le reste du site.
 *
 * Une dernière vignette "Voir tout le catalogue" complète toujours la grille
 * (jusqu'à 4 cases au total), pour un rendu 2x2 équilibré même quand moins de
 * 3 modèles sont mis en avant.
 *
 * Ceci est un AJOUT (aperçu) au Hero : il ne remplace pas la section
 * "Modèles mis en avant" (`FeaturedProducts`) plus bas sur la page.
 */
export function HeroCatalogSample({
  models,
  promotions,
}: {
  models: ProductModel[];
  promotions: Promotion[];
}) {
  if (models.length === 0) {
    // Aucun modèle mis en avant pour le moment : on n'affiche pas de grille
    // vide dans le Hero plutôt que de forcer un contenu artificiel.
    return null;
  }

  // Règle déterministe quand plus de 3 modèles sont "featured" : on retient
  // les plus récemment mis à jour, pour un aperçu qui reste pertinent sans
  // dépendre de l'ordre de saisie côté gestion.
  const sample = [...models]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_PRODUCT_TILES);

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5">
      {sample.map((model) => {
        const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
        const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);

        return (
          <Link
            key={model.id}
            href={`/catalogue/${model.slug}`}
            className="group relative block aspect-square overflow-hidden rounded-2xl border border-white/15 bg-white/5"
          >
            {mainImage ? (
              <Image
                src={mainImage.url}
                alt={mainImage.alt}
                fill
                sizes="(min-width: 1024px) 220px, 45vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : null}

            {/* Voile dégradé pour garder le nom du produit lisible sur toute image. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/10 to-transparent"
            />

            {effective.isPromotionActive && effective.discountPercent !== null && (
              <span className="absolute left-2 top-2">
                <DiscountBadge percent={effective.discountPercent} />
              </span>
            )}

            <p className="absolute inset-x-0 bottom-0 truncate p-3 font-display text-sm font-semibold text-white">
              {model.name}
            </p>
          </Link>
        );
      })}

      <Link
        href="/catalogue"
        className="group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-white/25 bg-white/5 text-center transition-colors hover:bg-white/10"
      >
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-green-300 transition-transform group-hover:translate-x-0.5"
        >
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="px-3 font-display text-sm font-semibold text-white">
          Voir tout le catalogue
        </span>
      </Link>
    </div>
  );
}
