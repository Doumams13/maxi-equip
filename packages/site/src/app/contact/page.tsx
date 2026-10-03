import type { Metadata } from "next";
import Image from "next/image";
import { locationRepository } from "@/services/location";
import { getEffectiveContactInfo } from "@/services/settings";
import { buildWhatsAppUrl } from "@/config/site";
import { LinkButton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ContactForm } from "./ContactForm";

const TITRE_CONTACT = "Contact";
const DESCRIPTION_CONTACT = "Contactez MAXI EQUIP à Libreville : showroom, WhatsApp, téléphone et formulaire de contact.";

export const metadata: Metadata = {
  title: TITRE_CONTACT,
  description: DESCRIPTION_CONTACT,
  alternates: { canonical: "/contact" },
  openGraph: { title: TITRE_CONTACT, description: DESCRIPTION_CONTACT, images: [{ url: "/images/contact/showroom.png" }] },
  twitter: { title: TITRE_CONTACT, description: DESCRIPTION_CONTACT, images: ["/images/contact/showroom.png"] },
};

export default async function ContactPage() {
  try {
    const [locations, contact] = await Promise.all([locationRepository.listLocations(), getEffectiveContactInfo()]);

    return (
      <div className="mx-auto max-w-[1320px] px-[18px] sm:px-7">
        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="relative flex min-h-[560px] flex-col justify-center overflow-hidden py-16">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.02]"
            aria-hidden="true"
          >
            <Image
              src="/logo/maxi-equip-symbole.png"
              alt=""
              width={1500}
              height={950}
              style={{ width: "1500px", maxWidth: "none", height: "auto" }}
            />
          </div>
          <p className="relative mb-3 font-display text-[14px] italic text-sage">Parlons de votre projet</p>
          <h1 className="relative max-w-[14ch] font-display text-[clamp(34px,5vw,56px)] font-medium leading-[1.05] text-forest-deep">
            Construisons votre intérieur.
          </h1>
          <p className="relative mt-5 max-w-[56ch] text-[17px] leading-relaxed text-ink-mute">
            Du choix du motif à la pose, MAXI EQUIP accompagne chaque projet avec le même soin : un conseiller vous aide
            à trouver le carrelage qui donnera le ton juste à votre espace.
          </p>
        </section>

        {/* ── COMPOSITION: photo + contact panel ───────────────────────── */}
        <section className="mb-[72px] mt-6">
          <div className="grid grid-cols-1 min-[960px]:grid-cols-[1.3fr_1fr]">
            {/* Showroom photo */}
            <div className="relative min-h-[360px] overflow-hidden rounded bg-surface-soft min-[960px]:rounded-r-none">
              <Image
                src="/images/contact/showroom.png"
                alt="Showroom MAXI EQUIP, présentation de carreaux"
                fill
                className="object-cover"
                sizes="(min-width: 960px) 57vw, 100vw"
                priority
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(to top, rgba(18,42,29,0.75), rgba(18,42,29,0) 55%)" }}
              />
              <div className="absolute bottom-6 left-6 right-6 z-10 text-[#F4EEE2]">
                <div className="text-[12px] tracking-[0.04em] opacity-80">Univers</div>
                <div className="mt-1 font-display text-[22px]">Faïence &amp; grès cérame, en situation</div>
              </div>
            </div>

            {/* Contact panel */}
            <div className="border border-ink/[0.14] border-t-0 bg-surface px-7 py-9 min-[960px]:-ml-px min-[960px]:border-l-0 min-[960px]:border-t">
              <h2 className="mb-2 font-display text-[26px] font-medium">Nous joindre</h2>
              <p className="mb-7 text-[14px] text-ink-mute">Une réponse rapide, par le canal qui vous convient.</p>

              {/* WhatsApp CTA */}
              <a
                href={buildWhatsAppUrl(`Bonjour ${contact.nom}, je souhaite être conseillé.`, contact.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-[14px] rounded bg-clay p-[18px_20px] text-white"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.18]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12.04 2.5c-5.28 0-9.56 4.28-9.56 9.56 0 1.69.44 3.33 1.28 4.78L2.5 21.5l4.83-1.24a9.53 9.53 0 0 0 4.71 1.24h.01c5.28 0 9.56-4.28 9.56-9.56S17.32 2.5 12.04 2.5Z" />
                  </svg>
                </span>
                <span>
                  <div className="text-[12px] opacity-[0.85]">Réponse la plus rapide</div>
                  <div className="text-[16px] font-bold">Écrire sur WhatsApp</div>
                </span>
                <span className="ml-auto opacity-[0.85]" aria-hidden="true">
                  →
                </span>
              </a>

              {/* Contact list */}
              <ul className="m-0 mt-[22px] flex list-none flex-col gap-1 p-0">
                <li className="flex items-center gap-[14px] border-b border-dashed border-ink/[0.14] py-[14px]">
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-sage-pale text-forest-deep">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
                    </svg>
                  </span>
                  <span>
                    <div className="text-[12px] text-ink-mute">Téléphone</div>
                    <div className="text-[15px] font-semibold">{contact.telephone}</div>
                  </span>
                </li>
                <li className="flex items-center gap-[14px] border-b border-dashed border-ink/[0.14] py-[14px]">
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-sage-pale text-forest-deep">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                  </span>
                  <span>
                    <div className="text-[12px] text-ink-mute">Email</div>
                    <div className="text-[15px] font-semibold">{contact.email}</div>
                  </span>
                </li>
                <li className="flex items-center gap-[14px] py-[14px]">
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-sage-pale text-forest-deep">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span>
                    <div className="text-[12px] text-ink-mute">Showroom</div>
                    {/* BUG CORRIGÉ ("adresse configurée dans l'app invisible
                        sur le site") : même correction que Footer.tsx —
                        affichée UNIQUEMENT si réellement configurée. */}
                    {contact.adresse && <div className="text-[15px] font-semibold">{contact.adresse}</div>}
                    <div className={contact.adresse ? "text-[13px] text-ink-mute" : "text-[15px] font-semibold"}>{contact.quartier}</div>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── LOCATIONS ────────────────────────────────────────────────── */}
        <section className="mb-[88px]">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-[clamp(24px,3vw,32px)] font-medium">Où nous trouver</h2>
          </div>
          <div className="grid grid-cols-1 gap-px border border-ink/[0.14] bg-ink/[0.14] min-[760px]:grid-cols-3">
            {locations.map((loc) => (
              <div key={loc.id} className="bg-surface p-[28px_24px]">
                <svg
                  className={`mb-[18px] h-[34px] w-[34px] text-forest ${loc.kind === "depot" ? "opacity-[0.55]" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <h3 className="mb-1 font-display text-[19px] font-medium">{loc.name}</h3>
                <p className="mb-3.5 text-[12px] text-sage">
                  {loc.kind === "point_de_vente" ? "Point de vente" : "Stockage — pas de vente sur place"}
                </p>
                <p className="text-[13.5px] leading-relaxed text-ink-mute">
                  {loc.city}
                  <br />
                  {loc.address}
                </p>
                {loc.hours && (
                  <p className="mt-2.5 border-t border-dashed border-ink/[0.14] pt-2.5 text-[12.5px] text-ink-mute">
                    {loc.hours}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── FORM ─────────────────────────────────────────────────────── */}
        <section className="mb-[88px] grid grid-cols-1 gap-10 min-[900px]:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="mb-[14px] font-display text-[clamp(24px,3vw,32px)] font-medium">Une question précise ?</h2>
            <p className="max-w-[42ch] text-[15px] leading-[1.65] text-ink-mute">
              Écrivez-nous directement : nom, coordonnées, et l&apos;objet de votre demande. Un conseiller MAXI EQUIP
              vous répond personnellement.
            </p>
          </div>
          <ContactForm whatsappNumero={contact.whatsapp} />
        </section>

        {/* ── FINAL CTA ────────────────────────────────────────────────── */}
        <section className="mb-[72px] rounded bg-sage-pale px-10 py-14 text-center text-forest-deep">
          <p className="mb-2.5 text-[14px] text-sage">Un projet en tête ?</p>
          <h2 className="mb-6 font-display text-[clamp(26px,4vw,40px)] font-medium">
            Découvrez le catalogue et composez votre sélection.
          </h2>
          <LinkButton href="/catalogue" variant="primary">
            Voir le catalogue →
          </LinkButton>
        </section>
      </div>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1320px] px-[18px] py-20 sm:px-7">
        <ErrorState
          description={
            error instanceof Error
              ? error.message
              : "Impossible de charger les informations de contact pour le moment."
          }
        />
      </div>
    );
  }
}
