import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { DiscountBadge } from "@/components/ui/primitives";

const MAX_TILES = 3;

export function ShowroomWall({ models, promotions }: { models: ProductModel[]; promotions: Promotion[] }) {
  if (models.length === 0) return null;

  const sample = [...models]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_TILES);

  const [large, ...rest] = sample;
  if (!large) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <Tile model={large} promotions={promotions} className="col-span-2 aspect-[16/11] sm:aspect-[16/10]" />
      {rest.map((model) => (
        <Tile key={model.id} model={model} promotions={promotions} className="aspect-square" />
      ))}
      {rest.length < 2 && (
        <Link
          href="/catalogue"
          className="group flex aspect-square flex-col items-center justify-center gap-2 border border-dashed border-stone-300 bg-white text-center transition-colors hover:border-pine-700"
        >
          <span className="font-display text-sm text-stone-700 group-hover:text-pine-700">Voir le catalogue</span>
        </Link>
      )}
    </div>
  );
}

function Tile({ model, promotions, className }: { model: ProductModel; promotions: Promotion[]; className: string }) {
  const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);

  return (
    <Link href={`/catalogue/${model.slug}`} className={`group relative block overflow-hidden bg-stone-100 ${className}`}>
      {mainImage ? (
        <Image
          src={mainImage.url}
          alt={mainImage.alt}
          fill
          sizes="(min-width: 1024px) 320px, 45vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : null}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/0 to-transparent" />
      {effective.isPromotionActive && effective.discountPercent !== null && (
        <span className="absolute left-3 top-3">
          <DiscountBadge percent={effective.discountPercent} />
        </span>
      )}
      <p className="absolute inset-x-0 bottom-0 p-3.5 font-display text-base text-stone-50">{model.name}</p>
    </Link>
  );
}
