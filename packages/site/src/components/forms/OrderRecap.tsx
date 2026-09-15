"use client";

import { formatFcfa } from "@/lib/format";
import type { CartLine } from "@/lib/types/cart";

export function OrderRecap({ lines, totalFcfa }: { lines: CartLine[]; totalFcfa: number }) {
  return (
    <div className="h-fit border-t-2 border-ink pt-6">
      <p className="font-display text-lg italic text-ink/50">Votre demande</p>
      <ul className="mt-4 space-y-3 text-sm">
        {lines.map((line) => (
          <li key={line.variantId} className="flex justify-between gap-2">
            <span className="text-ink/70">
              {line.productModelName} ({line.size}) × {line.quantity}
            </span>
            <span className="shrink-0 text-ink">{formatFcfa(line.unitPriceFcfa * line.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-between border-t border-ink/15 pt-3 font-display text-xl italic text-ink">
        <span>Total estimé</span>
        <span>{formatFcfa(totalFcfa)}</span>
      </div>
    </div>
  );
}
