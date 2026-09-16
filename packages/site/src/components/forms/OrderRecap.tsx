"use client";

import { formatFcfa } from "@/lib/format";
import type { CartLine } from "@/lib/types/cart";

export function OrderRecap({ lines, totalFcfa }: { lines: CartLine[]; totalFcfa: number }) {
  return (
    <div className="rounded bg-surface-soft p-6">
      <h3 className="mb-3.5 font-display text-base">Votre panier</h3>
      <div>
        {lines.map((line) => (
          <div key={line.variantId} className="flex justify-between border-b border-ink/[0.08] py-2 text-[13.5px] text-ink-mute">
            <span>
              {line.productModelName} ({line.size}) × {line.quantity}
            </span>
            <b className="font-semibold text-ink">{formatFcfa(line.unitPriceFcfa * line.quantity)}</b>
          </div>
        ))}
        <div className="flex justify-between pt-3 font-display text-base font-bold">
          <span>Total estimé</span>
          <span>{formatFcfa(totalFcfa)}</span>
        </div>
      </div>
    </div>
  );
}
