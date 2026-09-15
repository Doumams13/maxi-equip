import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-body font-semibold tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-700 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-pine-700 text-stone-50 hover:bg-pine-800",
  secondary: "bg-transparent text-stone-900 border border-stone-300 hover:border-stone-900",
  ghost: "bg-transparent text-pine-700 underline decoration-1 underline-offset-4 hover:text-pine-800",
  danger: "bg-transparent text-status-error border border-status-error hover:bg-status-errorBg",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3.5 py-1.5",
  md: "text-base px-5 py-2.5",
  lg: "text-base px-7 py-3.5",
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

export function Button({ variant = "primary", size = "md", children, className = "", fullWidth, ...rest }: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "md", children, className = "", fullWidth, href, target, rel }: LinkButtonProps) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {children}
    </Link>
  );
}
