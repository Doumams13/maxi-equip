"use client";

import { formatFcfa } from "@/lib/format";
import type { CartLine } from "@/lib/types/cart";

export function OrderRecap({ lines, totalFcfa }: { lines: CartLine[]; totalFcfa: number }) {
  return (
    <div className="h-fit border-t-2 border-pine-700 bg-stone-50 p-6">
      <h2 className="font-display text-lg text-stone-900">Votre demande</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {lines.map((line) => (
          <li key={line.variantId} className="flex justify-between gap-2">
            <span className="text-stone-600">
              {line.productModelName} ({line.size}) × {line.quantity}
            </span>
            <span className="shrink-0 font-medium text-stone-800">
              {formatFcfa(line.unitPriceFcfa * line.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-between border-t border-stone-200 pt-3 font-display text-lg text-stone-900">
        <span>Total estimé</span>
        <span>{formatFcfa(totalFcfa)}</span>
      </div>
    </div>
  );
}
