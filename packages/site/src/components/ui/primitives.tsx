import type { ReactNode } from "react";
import { formatFcfa } from "@/lib/format";
import type { EffectivePrice } from "@/lib/types/catalog";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "promo" | "type";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-100 text-ink-700",
    promo: "bg-status-errorBg text-status-error",
    type: "bg-green-50 text-green-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Badge de réduction ("-17 %"), rouge et lisible, destiné à être posé sur une
 * image produit sans la masquer complètement (petit format, coin de l'image).
 * `percent` doit déjà être arrondi (voir `computeDiscountPercent` dans
 * src/lib/pricing.ts) — ce composant ne fait qu'afficher la valeur.
 */
export function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-status-error px-2 py-1 text-xs font-bold text-white shadow-sm">
      -{percent}%
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
  return (
    <div className={`rounded-lg border border-ink-100 bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

/** Affiche le prix normal barré + le prix promotionnel quand une promotion est active, sinon uniquement le prix normal (cahier des charges §10 : les deux prix restent toujours distincts). */
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
      <div className="flex items-baseline gap-2">
        <span className={`font-display font-bold text-status-error ${sizes.main}`}>
          {formatFcfa(price.promoPriceFcfa)}
        </span>
        <span className={`text-ink-400 line-through ${sizes.strike}`}>
          {formatFcfa(price.normalPriceFcfa)}
        </span>
      </div>
    );
  }

  return (
    <span className={`font-display font-bold text-ink-800 ${sizes.main}`}>
      {formatFcfa(price.normalPriceFcfa)}
    </span>
  );
}
