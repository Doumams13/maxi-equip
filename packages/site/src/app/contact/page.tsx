import type { Metadata } from "next";
import { locationRepository } from "@/services/location";
import { buildWhatsAppUrl, siteConfig } from "@/config/site";
import { LocationsSection } from "@/components/home/LocationsSection";
import { ErrorState } from "@/components/ui/states";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contactez MAXI EQUIP à Libreville : téléphone, WhatsApp et point de vente.",
};

export default async function ContactPage() {
  try {
    const locations = await locationRepository.listLocations();

    return (
      <div>
        <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-10">
          <h1 className="font-display text-display-1 italic leading-none text-ink">Parlons de votre projet</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/60">
            Une question sur un modèle, une taille ou une disponibilité ? Écrivez-nous, nous vous répondons rapidement.
          </p>

          <div className="mt-10 grid grid-cols-1 divide-y divide-ink/15 border-y border-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <a href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`} className="group flex items-baseline justify-between py-6 sm:pr-8">
              <span className="font-display text-3xl italic text-ink group-hover:text-ember">Téléphone</span>
              <span className="text-sm text-ink/50">{siteConfig.contact.phoneDisplay}</span>
            </a>
            <a
              href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, j'ai une question.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-baseline justify-between py-6 sm:pl-8"
            >
              <span className="font-display text-3xl italic text-ink group-hover:text-ember">WhatsApp</span>
              <span className="text-sm text-ink/50">Réponse rapide</span>
            </a>
          </div>
        </div>

        <LocationsSection locations={locations} />
      </div>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger les informations de contact pour le moment."} />
      </div>
    );
  }
}
