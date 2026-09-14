import Link from "next/link";
import Image from "next/image";
import { siteConfig } from "@/config/site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-ink-100 bg-ink-800 text-ink-100">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <Image
            src="/logo/maxi-equip-logo.png"
            alt="Logo MAXI EQUIP"
            width={160}
            height={41}
            className="h-9 w-auto brightness-0 invert"
          />
          <p className="mt-4 max-w-xs text-sm text-ink-300">{siteConfig.description}</p>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-200">
            Navigation
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/" className="hover:text-white">Accueil</Link></li>
            <li><Link href="/catalogue" className="hover:text-white">Catalogue</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-200">
            Contact
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-300">
            <li>{siteConfig.city}</li>
            <li>
              <a className="hover:text-white" href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`}>
                Tél. {siteConfig.contact.phoneDisplay}
              </a>
            </li>
            <li>
              <a className="hover:text-white" href={`mailto:${siteConfig.contact.email}`}>
                {siteConfig.contact.email}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-700">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {year} {siteConfig.legalName}. Tous droits réservés.</p>
          <p>RCCM {siteConfig.legalMentions.rccm} — NIF {siteConfig.legalMentions.nif}</p>
        </div>
      </div>
    </footer>
  );
}
