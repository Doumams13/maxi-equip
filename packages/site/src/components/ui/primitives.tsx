import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { formatFcfa } from "@/lib/format";
import type { EffectivePrice } from "@/lib/types/catalog";

type Variant = "primary" | "ghost" | "clay";

const base = "inline-flex items-center gap-2 rounded px-6 py-3.5 text-[14.5px] font-semibold transition-colors active:scale-[.97]";
const variants: Record<Variant, string> = {
  primary: "bg-forest text-bg hover:bg-forest-deep",
  ghost: "bg-transparent text-ink border border-ink/[0.14] hover:border-ink",
  clay: "bg-clay text-white",
};

interface CommonProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
interface LinkButtonProps extends CommonProps {
  href: string;
  target?: string;
  rel?: string;
}

export function Button({ variant = "primary", children, className = "", fullWidth, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${fullWidth ? "w-full justify-center" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", children, className = "", fullWidth, href, target, rel }: LinkButtonProps) {
  return (
    <Link href={href} target={target} rel={rel} className={`${base} ${variants[variant]} ${fullWidth ? "w-full justify-center" : ""} ${className}`}>
      {children}
    </Link>
  );
}

export function DiscountBadge({ percent }: { percent: number }) {
  return <span className="absolute left-3 top-3 rounded-sm bg-surface px-2.5 py-1 text-[11.5px] font-bold text-clay">−{percent}%</span>;
}

export function PriceTag({
  price,
  context,
  size = "md",
}: {
  price: EffectivePrice;
  context: "general" | "selected";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "text-[15px]", md: "text-[22px]", lg: "text-[28px]" }[size];
  const strikeSizes = { sm: "text-[11px]", md: "text-sm", lg: "text-[15px]" }[size];
  const now = price.isPromotionActive && price.promoPriceFcfa !== null ? price.promoPriceFcfa : price.normalPriceFcfa;

  if (context === "general") {
    return (
      <div className="whitespace-nowrap text-right">
        <span className="block font-body text-[11px] font-normal text-ink-mute">À partir de</span>
        <span className={`block font-display font-semibold ${sizes} ${price.isPromotionActive ? "text-clay" : "text-ink"}`}>{formatFcfa(now)}</span>
        {price.isPromotionActive && price.promoPriceFcfa !== null && (
          <span className={`block ${strikeSizes} text-ink-mute line-through`}>{formatFcfa(price.normalPriceFcfa)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`font-display font-semibold ${sizes} ${price.isPromotionActive ? "text-clay" : "text-ink"}`}>{formatFcfa(now)}</span>
      {price.isPromotionActive && price.promoPriceFcfa !== null && (
        <span className={`${strikeSizes} text-ink-mute line-through`}>{formatFcfa(price.normalPriceFcfa)}</span>
      )}
    </div>
  );
}
