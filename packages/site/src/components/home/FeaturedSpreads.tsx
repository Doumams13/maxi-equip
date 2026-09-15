import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { PriceTag } from "@/components/ui/primitives";

export function FeaturedSpreads({ models, promotions }: { models: ProductModel[]; promotions: Promotion[] }) {
  if (models.length === 0) return null;
  const sample = models.slice(0, 3);

  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1400px] px-5 pb-24 sm:px-10">
        <p className="font-display text-lg italic text-ink/50">Mises en avant en ce moment</p>
        <div className="mt-10 space-y-20 sm:space-y-28">
          {sample.map((model, i) => {
            const image = [...model.images].sort((a, b) => a.order - b.order)[0];
            const { effective, fromMultipleSizes } = getModelDisplayPrice(model.variants, promotions, model.id);
            const imageFirst = i % 2 === 0;

            return (
              <Link
                key={model.id}
                href={`/catalogue/${model.slug}`}
                className={`group grid grid-cols-1 items-center gap-8 sm:grid-cols-2 sm:gap-14 ${imageFirst ? "" : "sm:[&>*:first-child]:order-2"}`}
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-ink/5">
                  {image && (
                    <Image
                      src={image.url}
                      alt={image.alt}
                      fill
                      sizes="(min-width: 640px) 640px, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                </div>
                <div>
                  <p className="font-display text-base italic text-ink/45">{model.type}</p>
                  <h3 className="mt-2 font-display text-display-2 italic leading-none text-ink transition-colors group-hover:text-ember">
                    {model.name}
                  </h3>
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink/60">{model.description}</p>
                  <div className="mt-6 flex items-baseline gap-2">
                    {fromMultipleSizes && <span className="text-xs text-ink/40">à partir de</span>}
                    <PriceTag price={effective} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
