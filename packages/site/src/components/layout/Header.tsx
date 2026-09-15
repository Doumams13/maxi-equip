import Image from "next/image";
import Link from "next/link";
import { CartIndicator } from "./CartIndicator";
import { MobileNav } from "./MobileNav";
import { siteConfig } from "@/config/site";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/contact", label: "Contact" },
];

/**
 * Refonte — une fine barre utilitaire (vert profond) au-dessus du header
 * blanc habituel : un repère de matière immédiat avant même le contenu,
 * et le téléphone toujours visible sans encombrer la navigation
 * principale.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="hidden bg-pine-800 text-stone-50 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs sm:px-6">
          <span>Showroom à Libreville — {siteConfig.city}</span>
          <a href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`} className="font-medium hover:underline">
            {siteConfig.contact.phoneDisplay}
          </a>
        </div>
      </div>

      <div className="border-b border-stone-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="MAXI EQUIP — Accueil">
            <Image
              src="/logo/maxi-equip-logo.png"
              alt="Logo MAXI EQUIP, spécialiste du carrelage"
              width={172}
              height={44}
              priority
              className="h-9 w-auto sm:h-10"
            />
          </Link>

          <nav aria-label="Navigation principale" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:text-pine-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-1">
            <CartIndicator />
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  );
}
