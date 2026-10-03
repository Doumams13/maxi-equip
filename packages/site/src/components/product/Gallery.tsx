"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/lib/types/catalog";

export function Gallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  const sorted = [...images].sort((a, b) => a.order - b.order);
  const [activeId, setActiveId] = useState(sorted[0]?.id);
  const active = sorted.find((i) => i.id === activeId) ?? sorted[0];

  if (!active) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-sm bg-surface-soft text-sm text-ink-mute">
        Aucune image disponible pour {productName}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[340px] sm:mx-0 sm:max-w-none">
      <div className="relative aspect-square overflow-hidden rounded-sm">
        <Image key={active.id} src={active.url} alt={active.alt} fill priority sizes="(min-width: 860px) 480px, 100vw" className="object-cover" />
      </div>
      {sorted.length > 1 && (
        <div className="mt-3 flex justify-center gap-2.5 sm:justify-start" role="tablist" aria-label={`Images de ${productName}`}>
          {sorted.map((img) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={img.id === active.id}
              onClick={() => setActiveId(img.id)}
              className={`relative h-[60px] w-[60px] overflow-hidden rounded-sm border-2 ${img.id === active.id ? "border-forest" : "border-transparent"}`}
            >
              <Image src={img.url} alt={img.alt} fill sizes="60px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
