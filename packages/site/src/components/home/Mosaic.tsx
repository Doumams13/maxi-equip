import Image from "next/image";
import Link from "next/link";
import type { ProductModel, ProductImage, Promotion } from "@/lib/types/catalog";
import { getModelDisplayPrice } from "@/lib/pricing";

interface Tuile {
  model: ProductModel;
  image: ProductImage;
  discountPercent: number | null;
}

/**
 * Correction "carreaux en promo visibles instantanément" — la mosaïque
 * occupe déjà le haut de page, visible sans scroller (voir Hero.tsx) ;
 * les modèles en promotion sont désormais placés EN PREMIER (donc dans
 * les deux grandes cases, les plus visibles), avec un badge "-X%" sur
 * chaque. Les modèles restants comblent le reste, sans doublon, jamais
 * de promotion inventée pour un modèle qui n'en a pas réellement.
 */
export function Mosaic({ models, promotedModels, promotions }: { models: ProductModel[]; promotedModels: ProductModel[]; promotions: Promotion[] }) {
  const idsPromus = new Set(promotedModels.map((m) => m.id));
  const complement = models.filter((m) => !idsPromus.has(m.id));
  const modelesOrdonnes = [...promotedModels, ...complement];

  const tuiles = modelesOrdonnes
    .map((model): Tuile | null => {
      const image = [...model.images].sort((a, b) => a.order - b.order)[0];
      if (!image) return null;
      const discountPercent = idsPromus.has(model.id) ? getModelDisplayPrice(model.variants, promotions, model.id).effective.discountPercent : null;
      return { model, image, discountPercent };
    })
    .filter((t): t is Tuile => Boolean(t));

  if (tuiles.length === 0) return <div className="aspect-square rounded-sm bg-surface-soft" />;

  const at = (i: number) => tuiles[i % tuiles.length]!;

  const smallCells = [
    "col-start-3 row-start-1",
    "col-start-4 row-start-1",
    "col-start-3 row-start-2",
    "col-start-4 row-start-2",
    "col-start-1 row-start-3",
    "col-start-2 row-start-3",
    "col-start-1 row-start-4",
    "col-start-2 row-start-4",
  ];

  return (
    <div className="grid aspect-square grid-cols-4 grid-rows-4 gap-1.5">
      <Tile tuile={at(0)} className="col-start-1 col-span-2 row-start-1 row-span-2" sizes="240px" />
      {smallCells.map((cls, i) => (
        <Tile key={cls} tuile={at(i + 1)} className={cls} sizes="120px" />
      ))}
      <Tile tuile={at(9)} className="col-start-3 col-span-2 row-start-3 row-span-2" sizes="240px" />
    </div>
  );
}

function Tile({ tuile, className, sizes }: { tuile: Tuile; className: string; sizes: string }) {
  return (
    <Link href={`/catalogue/${tuile.model.slug}`} className={`group relative block overflow-hidden rounded-sm ${className}`}>
      <Image src={tuile.image.url} alt={tuile.image.alt} fill sizes={sizes} className="object-cover transition-transform duration-500 group-hover:scale-105" />
      {tuile.discountPercent !== null && tuile.discountPercent > 0 && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-forest px-2 py-0.5 text-[11px] font-bold text-bg shadow-sm">
          -{tuile.discountPercent}%
        </span>
      )}
    </Link>
  );
}
