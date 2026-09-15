import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-10">
        <p className="max-w-2xl font-display text-4xl italic leading-tight sm:text-6xl">
          Un projet en tête ? Venez voir la matière de plus près.
        </p>
        <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 font-display text-lg italic">
          <Link href="/catalogue" className="hover:text-ember">Le catalogue</Link>
          <Link href="/contact" className="hover:text-ember">Nous trouver</Link>
          <a href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`} className="hover:text-ember">
            {siteConfig.contact.phoneDisplay}
          </a>
        </div>
      </div>
      <div className="border-t border-paper/15">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-5 py-5 text-xs text-paper/50 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <p>© {year} {siteConfig.legalName}</p>
          <p>RCCM {siteConfig.legalMentions.rccm} — NIF {siteConfig.legalMentions.nif}</p>
        </div>
      </div>
    </footer>
  );
}
