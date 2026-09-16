"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { itemCount } = useCart();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/[0.08] bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-[18px] py-3.5 sm:px-7">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo/maxi-equip-symbole.png"
            alt="MAXI EQUIP"
            width={57}
            height={36}
            priority
            className="h-9 w-auto sm:h-[46px]"
          />
          <span className="font-display text-base font-semibold text-forest-deep sm:text-xl">MAXI EQUIP</span>
        </Link>

        <nav
          aria-label="Navigation principale"
          className={`${open ? "flex" : "hidden"} fixed inset-x-0 top-[64px] z-40 flex-col items-start gap-0 bg-bg px-[18px] py-6 sm:static sm:flex sm:flex-row sm:items-center sm:gap-7 sm:bg-transparent sm:p-0`}
        >
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative w-full border-b border-ink/[0.08] py-3.5 text-lg sm:w-auto sm:border-none sm:py-1.5 sm:text-[15px] ${
                  active
                    ? "text-ink after:absolute after:inset-x-0 after:-bottom-0.5 after:hidden after:h-0.5 after:bg-clay sm:after:block"
                    : "text-ink-mute hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/panier"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded bg-forest px-4 py-2.5 text-sm font-semibold text-bg"
            aria-label={`Panier, ${itemCount} article${itemCount > 1 ? "s" : ""}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Panier
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-clay px-1 text-[11px] text-white">{itemCount}</span>
          </Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu" className="p-2 sm:hidden">
            <span className="my-[5px] block h-0.5 w-[22px] bg-ink" />
            <span className="my-[5px] block h-0.5 w-[22px] bg-ink" />
            <span className="my-[5px] block h-0.5 w-[22px] bg-ink" />
          </button>
        </div>
      </div>
    </header>
  );
}
