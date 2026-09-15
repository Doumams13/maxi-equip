"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/lib/types/catalog";

export function Gallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  const sorted = [...images].sort((a, b) => a.order - b.order);
  const [activeId, setActiveId] = useState(sorted[0]?.id);
  const active = sorted.find((i) => i.id === activeId) ?? sorted[0];

  if (!active) {
    return <div className="flex aspect-[4/5] items-center justify-center bg-ink/5 text-sm text-ink/40">Aucune image disponible pour {productName}</div>;
  }

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden bg-ink/5">
        <Image key={active.id} src={active.url} alt={active.alt} fill priority sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" />
      </div>
      {sorted.length > 1 && (
        <div className="mt-4 flex gap-3" role="tablist" aria-label={`Images de ${productName}`}>
          {sorted.map((img) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={img.id === active.id}
              onClick={() => setActiveId(img.id)}
              className={`relative h-20 w-20 overflow-hidden transition-opacity ${img.id === active.id ? "opacity-100 ring-2 ring-ember" : "opacity-50 hover:opacity-80"}`}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
