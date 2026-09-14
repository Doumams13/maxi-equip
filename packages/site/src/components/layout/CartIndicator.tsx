"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";

export function CartIndicator() {
  const { itemCount } = useCart();
  return (
    <Link
      href="/panier"
      aria-label={`Panier, ${itemCount} article${itemCount > 1 ? "s" : ""}`}
      className="relative inline-flex items-center rounded-md p-2 text-ink-700 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600"
    >
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="9" cy="21" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18" cy="21" r="1.4" fill="currentColor" stroke="none" />
        <path
          d="M2.5 3h2l2.2 11.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20.5 7H6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {itemCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[11px] font-bold text-white">
          {itemCount}
        </span>
      )}
    </Link>
  );
}
