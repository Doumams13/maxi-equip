import Image from "next/image";
import Link from "next/link";
import type { ProductModel } from "@/lib/types/catalog";

export function UniversStrip({ types, models }: { types: string[]; models: ProductModel[] }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto pb-2.5">
      {types.map((type) => {
        const sample = models.find((m) => m.type === type);
        const image = sample ? [...sample.images].sort((a, b) => a.order - b.order)[0] : undefined;
        const count = models.filter((m) => m.type === type).length;
        return (
          <Link key={type} href={`/catalogue?type=${encodeURIComponent(type)}`} className="w-[168px] shrink-0">
            <div className="relative aspect-square overflow-hidden rounded-sm">
              {image && <Image src={image.url} alt={image.alt} fill sizes="168px" className="object-cover" />}
            </div>
            <p className="mt-2.5 text-[13.5px] text-ink-mute">
              <b className="mb-0.5 block text-[14.5px] font-semibold text-ink">{type}</b>
              {count} modèle{count > 1 ? "s" : ""}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
