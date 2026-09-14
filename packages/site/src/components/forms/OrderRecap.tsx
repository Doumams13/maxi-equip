"use client";

import { formatFcfa } from "@/lib/format";
import type { CartLine } from "@/lib/types/cart";

export function OrderRecap({ lines, totalFcfa }: { lines: CartLine[]; totalFcfa: number }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 p-5">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-500">
        Votre demande
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {lines.map((line) => (
          <li key={line.variantId} className="flex justify-between gap-2">
            <span className="text-ink-700">
              {line.productModelName} ({line.size}) × {line.quantity}
            </span>
            <span className="shrink-0 font-semibold text-ink-800">
              {formatFcfa(line.unitPriceFcfa * line.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t border-ink-200 pt-3 text-sm font-bold text-ink-800">
        <span>Total estimé</span>
        <span>{formatFcfa(totalFcfa)}</span>
      </div>
    </div>
  );
}
