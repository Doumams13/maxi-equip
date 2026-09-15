"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";
import { siteConfig, buildWhatsAppUrl } from "@/config/site";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/catalogue", label: "Le catalogue" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { itemCount } = useCart();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-10">
          <Link href="/" className="font-display text-2xl italic tracking-tightest text-ink">
            {siteConfig.companyName}
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/panier"
              className="relative font-display text-lg italic text-ink hover:text-ember"
              aria-label={`Panier, ${itemCount} article${itemCount > 1 ? "s" : ""}`}
            >
              Panier
              {itemCount > 0 && <span className="ml-1.5 text-ember">({itemCount})</span>}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="menu-plein-ecran"
              className="font-display text-lg italic text-ink hover:text-ember"
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div id="menu-plein-ecran" className="fixed inset-0 z-50 flex flex-col bg-ink text-paper">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-4 sm:px-10">
            <span className="font-display text-2xl italic tracking-tightest">{siteConfig.companyName}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer le menu" className="font-display text-lg italic hover:text-ember">
              Fermer
            </button>
          </div>

          <nav aria-label="Navigation principale" className="flex flex-1 flex-col items-start justify-center gap-2 px-5 sm:px-10">
            {links.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-baseline gap-4 font-display text-[13vw] italic leading-[0.95] tracking-tightest text-paper transition-colors hover:text-ember sm:text-[8vw]"
              >
                <span className="text-base not-italic text-paper/40 sm:text-lg">0{i + 1}</span>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 border-t border-paper/15 px-5 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <a href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`} className="hover:text-ember">
              {siteConfig.contact.phoneDisplay}
            </a>
            <a
              href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, je souhaite avoir des informations.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ember"
            >
              Écrire sur WhatsApp
            </a>
            <span className="text-paper/50">{siteConfig.city}</span>
          </div>
        </div>
      )}
    </>
  );
}
