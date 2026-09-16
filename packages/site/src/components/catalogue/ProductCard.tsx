import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { DiscountBadge, PriceTag } from "@/components/ui/primitives";

export function ProductCard({ model, promotions }: { model: ProductModel; promotions: Promotion[] }) {
  const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);
  const sizes = [...new Set(model.variants.map((v) => v.size))];
  /**
   * Affiche la référence uniquement quand elle est non ambiguë (un seul
   * format) — dans les vraies données, chaque taille a sa propre
   * référence (ex. MB-4040/MB-6060/MB-8080) : en montrer une seule à
   * côté de plusieurs tailles serait trompeur pour le client.
   */
  const singleReference = model.variants.length === 1 ? model.variants[0]?.reference : undefined;

  return (
    <Link href={`/catalogue/${model.slug}`} className="block cursor-pointer">
      <div className="relative aspect-square overflow-hidden rounded-sm">
        {mainImage ? (
          <Image src={mainImage.url} alt={mainImage.alt} fill sizes="(min-width: 1000px) 260px, (min-width: 640px) 30vw, 45vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-soft text-xs text-ink-mute">Image indisponible</div>
        )}
        {effective.isPromotionActive && <DiscountBadge />}
      </div>
      <div className="mt-3 flex flex-col gap-1 sm:mt-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div>
          <h4 className="text-[15px] leading-tight">{model.name}</h4>
          <p className="mt-0.5 text-[11.5px] text-ink-mute">
            {singleReference && <>{singleReference} · </>}
            {sizes.join(" / ")}
          </p>
        </div>
        <div>
          <PriceTag price={effective} context="general" size="sm" />
        </div>
      </div>
    </Link>
  );
}
