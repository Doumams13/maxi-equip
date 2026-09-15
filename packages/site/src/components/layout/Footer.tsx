import Link from "next/link";
import Image from "next/image";
import { siteConfig } from "@/config/site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-pine-800 text-stone-200">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <Image
            src="/logo/maxi-equip-logo.png"
            alt="Logo MAXI EQUIP"
            width={160}
            height={41}
            className="h-9 w-auto brightness-0 invert"
          />
          <p className="mt-5 max-w-xs font-display text-lg italic leading-snug text-stone-100">{siteConfig.tagline}</p>
        </div>

        <div>
          <h2 className="font-display text-base text-stone-50">Navigation</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-stone-300">
            <li><Link href="/" className="hover:text-stone-50">Accueil</Link></li>
            <li><Link href="/catalogue" className="hover:text-stone-50">Catalogue</Link></li>
            <li><Link href="/contact" className="hover:text-stone-50">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-base text-stone-50">Nous joindre</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-stone-300">
            <li>{siteConfig.city}</li>
            <li>
              <a className="hover:text-stone-50" href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`}>
                {siteConfig.contact.phoneDisplay}
              </a>
            </li>
            <li>
              <a className="hover:text-stone-50" href={`mailto:${siteConfig.contact.email}`}>
                {siteConfig.contact.email}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-pine-700">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {year} {siteConfig.legalName}. Tous droits réservés.</p>
          <p>RCCM {siteConfig.legalMentions.rccm} — NIF {siteConfig.legalMentions.nif}</p>
        </div>
      </div>
    </footer>
  );
}
