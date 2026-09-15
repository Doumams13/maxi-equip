import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "solid" | "outline-light" | "outline-dark" | "text";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center gap-2.5 font-display italic transition-all disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  solid: "bg-ember text-paper hover:bg-ember-deep",
  "outline-light": "border border-paper/40 text-paper hover:border-paper hover:bg-paper hover:text-ink",
  "outline-dark": "border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-paper",
  text: "text-ink underline decoration-ember decoration-2 underline-offset-8 hover:text-ember",
};

const sizes: Record<Size, string> = {
  sm: "text-base px-5 py-2",
  md: "text-lg px-7 py-3",
  lg: "text-2xl px-9 py-4",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
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

export function Button({ variant = "solid", size = "md", children, className = "", fullWidth, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ variant = "solid", size = "md", children, className = "", fullWidth, href, target, rel }: LinkButtonProps) {
  return (
    <Link href={href} target={target} rel={rel} className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}>
      {children}
    </Link>
  );
}
