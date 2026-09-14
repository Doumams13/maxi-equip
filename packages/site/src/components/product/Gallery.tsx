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
      <div className="flex aspect-square items-center justify-center rounded-lg bg-ink-50 text-sm text-ink-400">
        Aucune image disponible pour {productName}
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-lg bg-ink-50">
        <Image
          key={active.id}
          src={active.url}
          alt={active.alt}
          fill
          priority
          sizes="(min-width: 1024px) 480px, 100vw"
          className="object-cover"
        />
      </div>
      {sorted.length > 1 && (
        <div className="mt-3 flex gap-2" role="tablist" aria-label={`Images de ${productName}`}>
          {sorted.map((img) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={img.id === active.id}
              onClick={() => setActiveId(img.id)}
              className={`relative h-16 w-16 overflow-hidden rounded-md border-2 ${
                img.id === active.id ? "border-green-600" : "border-transparent"
              }`}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
