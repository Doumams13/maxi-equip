import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { DiscountBadge, PriceTag } from "@/components/ui/primitives";

export function ProductCard({ model, promotions }: { model: ProductModel; promotions: Promotion[] }) {
  const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);
  const cheapestVariant = model.variants.find((v) => v.priceFcfa === Math.min(...model.variants.map((x) => x.priceFcfa)));

  return (
    <Link href={`/catalogue/${model.slug}`} className="block cursor-pointer">
      <div className="relative aspect-square overflow-hidden rounded-sm">
        {mainImage ? (
          <Image src={mainImage.url} alt={mainImage.alt} fill sizes="(min-width: 1000px) 260px, (min-width: 640px) 30vw, 45vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-soft text-xs text-ink-mute">Image indisponible</div>
        )}
        {effective.isPromotionActive && effective.discountPercent !== null && <DiscountBadge percent={effective.discountPercent} />}
      </div>
      <div className="mt-3 flex flex-col gap-1 sm:mt-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div>
          <h4 className="text-[15px] leading-tight">{model.name}</h4>
          <p className="mt-0.5 text-[11.5px] text-ink-mute">{cheapestVariant?.reference}</p>
        </div>
        <div className="sm:whitespace-nowrap sm:text-right">
          <PriceTag price={effective} context="general" size="sm" />
        </div>
      </div>
    </Link>
  );
}
