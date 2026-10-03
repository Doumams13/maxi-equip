import Image from "next/image";
import Link from "next/link";
import { buildWhatsAppUrl, siteConfig } from "@/config/site";
import { getEffectiveContactInfo } from "@/services/settings";

export async function Footer() {
  const year = new Date().getFullYear();
  // Correction "L'appli gère les infos du site" — téléphone/WhatsApp/email
  // réellement synchronisés depuis l'application quand disponibles,
  // repli sur config/site.ts sinon (voir getEffectiveContactInfo).
  const contact = await getEffectiveContactInfo();
  return (
    <footer className="mt-5 border-t border-ink/[0.14] bg-surface-soft text-ink">
      <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-9 px-[18px] py-14 sm:px-7 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <Image src="/logo/maxi-equip-symbole.png" alt={contact.nom} width={63} height={40} className="h-10 w-auto" />
            <span className="font-display text-lg font-semibold text-ink">{contact.nom}</span>
          </div>
          <p className="mt-3.5 max-w-[32ch] text-[13.5px] leading-relaxed text-ink-mute">
            Spécialiste du carrelage. Faïence, grès cérame, mosaïque et antidérapant sélectionnés pour vos sols et vos murs.
          </p>
        </div>

        <div>
          <h2 className="mb-3.5 font-body text-[13px] font-bold uppercase tracking-[0.06em] text-sage">Navigation</h2>
          <ul className="flex flex-col gap-2.5 text-sm text-ink-mute">
            <li><Link href="/" className="hover:text-ink">Accueil</Link></li>
            <li><Link href="/catalogue" className="hover:text-ink">Catalogue</Link></li>
            <li><Link href="/contact" className="hover:text-ink">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3.5 font-body text-[13px] font-bold uppercase tracking-[0.06em] text-sage">Showroom</h2>
          <ul className="flex flex-col gap-2.5 text-sm text-ink-mute">
            {/* BUG CORRIGÉ ("adresse configurée dans l'app invisible sur
                le site") : `contact.adresse` existait déjà côté API mais
                n'était jamais recopié dans EffectiveContactInfo (voir
                services/settings/index.ts) — jamais affiché nulle part,
                pas seulement ici. Affiché UNIQUEMENT si réellement
                configuré (jamais un champ vide ni une valeur inventée). */}
            {contact.adresse && <li>{contact.adresse}</li>}
            <li>{contact.quartier}</li>
            <li>{siteConfig.legalMentions.bp}</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3.5 font-body text-[13px] font-bold uppercase tracking-[0.06em] text-sage">Contact</h2>
          <ul className="flex flex-col gap-2.5 text-sm text-ink-mute">
            <li>
              <a href={`tel:${contact.telephone.replace(/\s/g, "")}`} className="hover:text-ink">
                {contact.telephone}
              </a>
            </li>
            <li>
              <a href={`mailto:${contact.email}`} className="hover:text-ink">
                {contact.email}
              </a>
            </li>
            <li>
              <a
                href={buildWhatsAppUrl(`Bonjour ${contact.nom}, j'ai une question.`, contact.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-semibold text-forest"
              >
                WhatsApp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink/[0.14]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-2 px-[18px] py-4.5 text-[12.5px] text-ink-mute sm:px-7">
          <span>© {year} {siteConfig.legalName}</span>
          <span>RCCM {siteConfig.legalMentions.rccm} — NIF {siteConfig.legalMentions.nif}</span>
        </div>
      </div>
    </footer>
  );
}
