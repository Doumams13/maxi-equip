import type { ReactNode } from "react";
import { formatFcfa } from "@/lib/format";
import type { EffectivePrice } from "@/lib/types/catalog";

/**
 * Refonte complète — les primitives abandonnent le "kit carte SaaS"
 * (coins arrondis + ombre systématique sur tout). À la place : des
 * modules à liseré fin (joint de pose), sans ombre par défaut — l'ombre
 * `floating` reste réservée aux éléments réellement flottants (menus,
 * modales), jamais posée sous chaque carte produit.
 */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "promo" | "type";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-stone-100 text-stone-700",
    promo: "bg-clay-50 text-clay-700",
    type: "bg-pine-50 text-pine-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span className="inline-flex items-center bg-clay-600 px-2.5 py-1 text-xs font-semibold text-stone-50">
      −{percent}%
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`border border-stone-200 bg-white ${className}`}>{children}</div>;
}

export function PriceTag({
  price,
  size = "md",
}: {
  price: EffectivePrice;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { main: "text-base", strike: "text-xs" },
    md: { main: "text-xl", strike: "text-sm" },
    lg: { main: "text-3xl", strike: "text-base" },
  }[size];

  if (price.isPromotionActive && price.promoPriceFcfa !== null) {
    return (
      <div className="flex items-baseline gap-2.5">
        <span className={`font-display font-semibold text-clay-600 ${sizes.main}`}>
          {formatFcfa(price.promoPriceFcfa)}
        </span>
        <span className={`text-stone-400 line-through ${sizes.strike}`}>{formatFcfa(price.normalPriceFcfa)}</span>
      </div>
    );
  }

  return (
    <span className={`font-display font-semibold text-stone-900 ${sizes.main}`}>
      {formatFcfa(price.normalPriceFcfa)}
    </span>
  );
}
