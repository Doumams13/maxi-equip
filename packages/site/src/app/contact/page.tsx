import type { Metadata } from "next";
import { locationRepository } from "@/services/location";
import { buildWhatsAppUrl, siteConfig } from "@/config/site";
import { LinkButton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contactez MAXI EQUIP à Libreville : téléphone, WhatsApp et showroom.",
};

export default async function ContactPage() {
  try {
    const locations = await locationRepository.listLocations();

    return (
      <div className="mx-auto max-w-[1180px] px-[18px] py-8 sm:px-7 sm:pb-16">
        <h1 className="font-display text-[clamp(26px,3vw,36px)] text-forest-deep">Contact</h1>
        <p className="mt-2.5 max-w-[52ch] text-[14.5px] text-ink-mute">Retrouvez-nous en showroom ou écrivez-nous directement.</p>

        <div className="mt-9 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {locations.map((loc) => (
            <div key={loc.id} className="border border-ink/[0.08] p-6.5">
              <h4 className="mb-1.5 text-[17px]">{loc.name}</h4>
              <p className="my-1 text-[13.5px] leading-relaxed text-ink-mute">
                {loc.kind === "point_de_vente" ? "Point de vente" : "Dépôt (achat au point de vente uniquement)"}
              </p>
              <p className="my-1 text-[13.5px] leading-relaxed text-ink-mute">{loc.city}</p>
              <p className="my-1 text-[13.5px] leading-relaxed text-ink-mute">{loc.address}</p>
              {loc.hours && <p className="my-1 text-[13.5px] leading-relaxed text-ink-mute">{loc.hours}</p>}
              {loc.kind === "point_de_vente" && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 rounded border border-ink/[0.14] px-3.5 py-2.5 text-[13px]">
                    {siteConfig.contact.phoneDisplay}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-[60px] flex flex-wrap items-center justify-between gap-6 rounded border border-ink/[0.08] bg-sage-pale p-[38px] text-forest-deep">
          <div>
            <h3 className="font-display text-xl text-forest-deep">Une question rapide ?</h3>
            <p className="mt-1.5 text-[13.5px] text-ink-mute">Écrivez-nous sur WhatsApp, un conseiller vous répond en quelques minutes.</p>
          </div>
          <LinkButton href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, j'ai une question.`)} target="_blank" rel="noopener noreferrer" variant="clay">
            Ouvrir WhatsApp
          </LinkButton>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1180px] px-[18px] py-20 sm:px-7">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger les informations de contact pour le moment."} />
      </div>
    );
  }
}
