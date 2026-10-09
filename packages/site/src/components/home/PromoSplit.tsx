import Image from "next/image";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";
import { formatFcfa } from "@/lib/format";

export function PromoSplit({ models, promotions }: { models: ProductModel[]; promotions: Promotion[] }) {
  if (models.length === 0) return null;
  const [main, ...rest] = models;
  const side = rest.slice(0, 2);

  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[1.3fr_1fr]">
      {main && <PromoTile model={main} promotions={promotions} big />}
      {side.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {side.map((m) => (
            <PromoTile key={m.id} model={m} promotions={promotions} />
          ))}
        </div>
      )}
    </div>
  );
}

function PromoTile({ model, promotions, big }: { model: ProductModel; promotions: Promotion[]; big?: boolean }) {
  const image = [...model.images].sort((a, b) => a.order - b.order)[0];
  const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);

  return (
    <Link href={`/catalogue/${model.slug}`} className={`group relative block overflow-hidden rounded-sm ${big ? "min-h-[340px]" : "min-h-0 flex-1"}`}>
      {image && (
        <Image src={image.url} alt={image.alt} fill sizes={big ? "700px" : "400px"} className="object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
      <div
        className={`absolute inset-0 flex h-full flex-col justify-end ${big ? "p-8" : "p-5"}`}
        style={{ background: "linear-gradient(to top, rgba(18,42,29,.72), rgba(18,42,29,0) 46%)" }}
      >
        <h3 className={`font-display text-bg ${big ? "text-2xl" : "text-lg"}`}>{model.name}</h3>
        <div className="mt-2.5 flex items-baseline gap-2.5">
          <span className="font-display text-[22px] font-semibold text-bg">{formatFcfa(effective.promoPriceFcfa ?? effective.normalPriceFcfa)}/m²</span>
          {effective.isPromotionActive && <span className="text-sm text-[#c7d3c9] line-through">{formatFcfa(effective.normalPriceFcfa)}/m²</span>}
        </div>
        <span className="text-[12.5px] text-[#cfdccf]">À partir de</span>
      </div>
    </Link>
  );
}
