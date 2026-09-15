import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { DiscountMark, PriceTag } from "@/components/ui/primitives";

export function ProductCard({ model, promotions }: { model: ProductModel; promotions: Promotion[] }) {
  const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective, fromMultipleSizes } = getModelDisplayPrice(model.variants, promotions, model.id);

  return (
    <Link href={`/catalogue/${model.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-ink/5">
        {mainImage ? (
          <Image
            src={mainImage.url}
            alt={mainImage.alt}
            fill
            sizes="(min-width: 1024px) 400px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink/40">Image indisponible</div>
        )}
        {effective.isPromotionActive && effective.discountPercent !== null && (
          <span className="absolute left-0 top-4">
            <DiscountMark percent={effective.discountPercent} />
          </span>
        )}
        <div className="absolute inset-0 flex items-end bg-ink/0 p-5 transition-colors duration-300 group-hover:bg-ink/25">
          <span className="translate-y-2 font-display text-2xl italic text-paper opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            {model.name}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div>
          <p className="font-display text-sm italic text-ink/45">{model.type}</p>
          <p className="font-display text-lg italic text-ink">{model.name}</p>
        </div>
        <div className="text-right">
          {fromMultipleSizes && <p className="text-xs text-ink/40">à partir de</p>}
          <PriceTag price={effective} size="sm" />
        </div>
      </div>
    </Link>
  );
}
