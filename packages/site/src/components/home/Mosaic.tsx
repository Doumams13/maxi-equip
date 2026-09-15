import Image from "next/image";
import type { ProductModel } from "@/lib/types/catalog";

export function Mosaic({ models }: { models: ProductModel[] }) {
  const images = models
    .map((m) => [...m.images].sort((a, b) => a.order - b.order)[0])
    .filter((img): img is NonNullable<typeof img> => Boolean(img));

  if (images.length === 0) return <div className="aspect-square rounded-sm bg-surface-soft" />;

  const at = (i: number) => images[i % images.length]!;

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
      <div className="relative col-start-1 col-span-2 row-start-1 row-span-2 overflow-hidden rounded-sm">
        <Image src={at(0).url} alt={at(0).alt} fill sizes="240px" className="object-cover" />
      </div>
      {smallCells.map((cls, i) => (
        <div key={cls} className={`relative overflow-hidden rounded-sm ${cls}`}>
          <Image src={at(i + 1).url} alt={at(i + 1).alt} fill sizes="120px" className="object-cover" />
        </div>
      ))}
      <div className="relative col-start-3 col-span-2 row-start-3 row-span-2 overflow-hidden rounded-sm">
        <Image src={at(9).url} alt={at(9).alt} fill sizes="240px" className="object-cover" />
      </div>
    </div>
  );
}
