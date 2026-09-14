import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { Badge, Card, DiscountBadge, PriceTag } from "@/components/ui/primitives";

export function ProductCard({
  model,
  promotions,
}: {
  model: ProductModel;
  promotions: Promotion[];
}) {
  const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective, fromMultipleSizes } = getModelDisplayPrice(
    model.variants,
    promotions,
    model.id
  );

  return (
    <Link href={`/catalogue/${model.slug}`} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden transition-shadow group-hover:shadow-floating">
        <div className="relative aspect-square overflow-hidden bg-ink-50">
          {mainImage ? (
            <Image
              src={mainImage.url}
              alt={mainImage.alt}
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-400">
              Image indisponible
            </div>
          )}
          {effective.isPromotionActive && effective.discountPercent !== null && (
            <span className="absolute left-2 top-2">
              <DiscountBadge percent={effective.discountPercent} />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <Badge tone="type">{model.type}</Badge>
          <h3 className="font-display text-base font-semibold text-ink-800">{model.name}</h3>
          <div className="mt-auto flex items-baseline gap-1.5 pt-2">
            {fromMultipleSizes && (
              <span className="text-xs text-ink-500">à partir de</span>
            )}
            <PriceTag price={effective} size="sm" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
