import type { ReactNode } from "react";
import { formatFcfa } from "@/lib/format";
import type { EffectivePrice } from "@/lib/types/catalog";

export function Eyebrow({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "paper" | "ember" }) {
  const colors = { ink: "text-ink/60", paper: "text-paper/70", ember: "text-ember" };
  return <span className={`font-display text-sm italic ${colors[tone]}`}>{children}</span>;
}

export function DiscountMark({ percent }: { percent: number }) {
  return <span className="bg-ember px-3 py-1.5 font-display text-sm italic text-paper">−{percent}% en ce moment</span>;
}

export function PriceTag({
  price,
  size = "md",
  dark = false,
}: {
  price: EffectivePrice;
  size?: "sm" | "md" | "lg";
  dark?: boolean;
}) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-5xl" }[size];
  const strikeSizes = { sm: "text-xs", md: "text-sm", lg: "text-lg" }[size];
  const base = dark ? "text-paper" : "text-ink";
  const muted = dark ? "text-paper/40" : "text-ink/35";

  if (price.isPromotionActive && price.promoPriceFcfa !== null) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className={`font-display italic ${sizes} text-ember`}>{formatFcfa(price.promoPriceFcfa)}</span>
        <span className={`${strikeSizes} ${muted} line-through`}>{formatFcfa(price.normalPriceFcfa)}</span>
      </div>
    );
  }

  return <span className={`font-display italic ${sizes} ${base}`}>{formatFcfa(price.normalPriceFcfa)}</span>;
}
