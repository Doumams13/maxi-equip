import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { Badge, DiscountBadge, PriceTag } from "@/components/ui/primitives";

export function ProductCard({
  model,
  promotions,
}: {
  model: ProductModel;
  promotions: Promotion[];
}) {
  const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective, fromMultipleSizes } = getModelDisplayPrice(model.variants, promotions, model.id);

  return (
    <Link href={`/catalogue/${model.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden border border-stone-200 bg-stone-100">
        {mainImage ? (
          <Image
            src={mainImage.url}
            alt={mainImage.alt}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-stone-400">Image indisponible</div>
        )}
        {effective.isPromotionActive && effective.discountPercent !== null && (
          <span className="absolute left-2.5 top-2.5">
            <DiscountBadge percent={effective.discountPercent} />
          </span>
        )}
      </div>

      <div className="mt-3.5">
        <Badge tone="type">{model.type}</Badge>
        <h3 className="mt-2 font-display text-lg text-stone-900">{model.name}</h3>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          {fromMultipleSizes && <span className="text-xs text-stone-500">à partir de</span>}
          <PriceTag price={effective} size="sm" />
        </div>
      </div>
    </Link>
  );
}
