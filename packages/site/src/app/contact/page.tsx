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
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Contact</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
          Une question sur un modèle, une taille ou une disponibilité ? Écrivez-nous, nous vous répondons rapidement.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <a
            href={`tel:${siteConfig.contact.phoneDisplay.replace(/\s/g, "")}`}
            className="flex items-center gap-4 border border-stone-200 p-6 transition-colors hover:border-pine-700"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-pine-50 text-pine-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
              </svg>
            </span>
            <div>
              <p className="font-display text-base text-stone-900">Téléphone</p>
              <p className="text-sm text-stone-500">{siteConfig.contact.phoneDisplay}</p>
            </div>
          </a>

          <a
            href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, j'ai une question.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 border border-stone-200 p-6 transition-colors hover:border-pine-700"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-pine-50 text-pine-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2.5c-5.28 0-9.56 4.28-9.56 9.56 0 1.69.44 3.33 1.28 4.78L2.5 21.5l4.83-1.24a9.53 9.53 0 0 0 4.71 1.24h.01c5.28 0 9.56-4.28 9.56-9.56S17.32 2.5 12.04 2.5Z" />
              </svg>
            </span>
            <div>
              <p className="font-display text-base text-stone-900">WhatsApp</p>
              <p className="text-sm text-stone-500">Réponse rapide, aux heures d&apos;ouverture</p>
            </div>
          </a>
        </div>

        <div className="mt-6 -mx-4 sm:-mx-6">
          <LocationsSection locations={locations} />
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
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
