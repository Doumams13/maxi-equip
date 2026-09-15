"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartLine } from "@/lib/types/cart";
import { formatFcfa } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";

export function CartTable({ lines }: { lines: CartLine[] }) {
  const { setQuantity, removeLine } = useCart();

  return (
    <ul className="divide-y divide-stone-200 border border-stone-200">
      {lines.map((line) => (
        <li key={line.variantId} className="flex gap-4 p-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden bg-stone-100">
            {line.imageUrl && (
              <Image src={line.imageUrl} alt={line.productModelName} fill sizes="80px" className="object-cover" />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                href={`/catalogue/${line.productModelSlug}`}
                className="font-display text-sm font-semibold text-stone-800 hover:underline"
              >
                {line.productModelName}
              </Link>
              <p className="text-xs text-stone-500">
                Taille {line.size} · Réf. {line.reference}
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-700">
                {formatFcfa(line.unitPriceFcfa)} / unité
              </p>
            </div>

            <div className="mt-3 flex items-center gap-4 sm:mt-0">
              <div className="flex items-center border border-stone-300">
                <button
                  type="button"
                  aria-label={`Diminuer la quantité de ${line.productModelName}`}
                  onClick={() => setQuantity(line.variantId, Math.max(1, line.quantity - 1))}
                  className="px-2.5 py-1.5 text-stone-600 hover:bg-stone-50"
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
                  className="px-2.5 py-1.5 text-stone-600 hover:bg-stone-50"
                >
                  +
                </button>
              </div>

              <p className="w-24 text-right text-sm font-bold text-stone-800">
                {formatFcfa(line.unitPriceFcfa * line.quantity)}
              </p>

              <button
                type="button"
                aria-label={`Retirer ${line.productModelName} du panier`}
                onClick={() => removeLine(line.variantId)}
                className="text-stone-400 hover:text-status-error"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
