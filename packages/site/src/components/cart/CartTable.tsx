"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartLine } from "@/lib/types/cart";
import { formatFcfa } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";

export function CartTable({ lines }: { lines: CartLine[] }) {
  const { setQuantity, removeLine } = useCart();

  return (
    <div>
      {lines.map((line) => (
        <div
          key={line.variantId}
          className="grid grid-cols-[64px_1fr] grid-rows-[auto_auto_auto] gap-x-3 gap-y-2 border-b border-ink/[0.08] py-3.5 sm:grid-cols-[78px_1fr_auto_auto] sm:grid-rows-1 sm:items-center sm:gap-x-4.5 sm:py-4.5"
        >
          <div className="relative row-span-3 h-16 w-16 overflow-hidden rounded-sm sm:row-span-1 sm:h-[78px] sm:w-[78px]">
            {line.imageUrl && <Image src={line.imageUrl} alt={line.productModelName} fill sizes="78px" className="object-cover" />}
          </div>

          <div className="col-start-2 row-start-1">
            <Link href={`/catalogue/${line.productModelSlug}`} className="text-[15.5px] hover:text-forest">
              {line.productModelName}
            </Link>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              Format {line.size} · Réf. {line.reference}
            </p>
            <button type="button" onClick={() => removeLine(line.variantId)} className="mt-1.5 text-[12.5px] text-ink-mute underline">
              Retirer
            </button>
          </div>

          <div className="col-start-2 row-start-2 flex w-fit items-center rounded border border-ink/[0.14] sm:col-auto sm:row-auto">
            <button
              type="button"
              aria-label={`Diminuer la quantité de ${line.productModelName}`}
              onClick={() => setQuantity(line.variantId, Math.max(1, line.quantity - 1))}
              className="h-8 w-8 text-sm"
            >
              −
            </button>
            <span className="w-7 text-center text-sm" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              aria-label={`Augmenter la quantité de ${line.productModelName}`}
              onClick={() => setQuantity(line.variantId, line.quantity + 1)}
              className="h-8 w-8 text-sm"
            >
              +
            </button>
          </div>

          <span className="col-span-2 row-start-3 text-left font-display text-[15px] font-semibold text-ink sm:col-span-1 sm:row-auto sm:text-right">
            {formatFcfa(line.unitPriceFcfa * line.quantity)}
          </span>
        </div>
      ))}
    </div>
  );
}
