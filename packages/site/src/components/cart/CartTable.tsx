"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartLine } from "@/lib/types/cart";
import { formatFcfa } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";

export function CartTable({ lines }: { lines: CartLine[] }) {
  const { setQuantity, removeLine } = useCart();

  return (
    <div className="divide-y divide-ink/15 border-y border-ink/15">
      {lines.map((line) => (
        <div key={line.variantId} className="flex gap-5 py-6">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden bg-ink/5">
            {line.imageUrl && <Image src={line.imageUrl} alt={line.productModelName} fill sizes="112px" className="object-cover" />}
          </div>

          <div className="flex flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <Link href={`/catalogue/${line.productModelSlug}`} className="font-display text-xl italic text-ink hover:text-ember">
                {line.productModelName}
              </Link>
              <p className="mt-1 text-xs text-ink/50">
                Taille {line.size} · Réf. {line.reference}
              </p>
              <p className="mt-1.5 font-display text-lg italic text-ink">{formatFcfa(line.unitPriceFcfa)}</p>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center border border-ink/20">
                <button
                  type="button"
                  aria-label={`Diminuer la quantité de ${line.productModelName}`}
                  onClick={() => setQuantity(line.variantId, Math.max(1, line.quantity - 1))}
                  className="px-3 py-1.5 text-ink hover:bg-ink/5"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm" aria-live="polite">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Augmenter la quantité de ${line.productModelName}`}
                  onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                  className="px-3 py-1.5 text-ink hover:bg-ink/5"
                >
                  +
                </button>
              </div>
              <span className="w-24 text-right font-display text-lg italic text-ink">{formatFcfa(line.unitPriceFcfa * line.quantity)}</span>
              <button
                type="button"
                onClick={() => removeLine(line.variantId)}
                aria-label={`Retirer ${line.productModelName} du panier`}
                className="text-xs text-ink/40 underline hover:text-status-error"
              >
                Retirer
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
