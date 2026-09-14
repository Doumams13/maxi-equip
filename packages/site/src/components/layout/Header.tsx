import Image from "next/image";
import Link from "next/link";
import { CartIndicator } from "./CartIndicator";
import { MobileNav } from "./MobileNav";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="relative border-b border-ink-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="MAXI EQUIP — Accueil">
          <Image
            src="/logo/maxi-equip-logo.png"
            alt="Logo MAXI EQUIP — Quincaillerie et Vente de Matériaux de Construction"
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
                  className="rounded-md px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-green-50 hover:text-green-700"
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
    </header>
  );
}
