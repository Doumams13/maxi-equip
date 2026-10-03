import type { Metadata } from "next";
import { catalogRepository } from "@/services/catalog";
import { Hero } from "@/components/home/Hero";
import { UniversStrip } from "@/components/home/UniversStrip";
import { PromoSplit } from "@/components/home/PromoSplit";
import { Principles } from "@/components/home/Principles";
import { FormatsGrid } from "@/components/home/FormatsGrid";
import { ErrorState } from "@/components/ui/states";

export const revalidate = 60;

// Titre/description hérités du layout racine (déjà pertinents pour
// l'accueil) — seule l'URL canonique est propre à cette page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  try {
    const [allModels, promotedModels, promotions, types, sizes] = await Promise.all([
      catalogRepository.listModels({}, "recent"),
      catalogRepository.listModels({ onlyPromotions: true }, "recent"),
      catalogRepository.listPromotions(),
      catalogRepository.listAvailableTypes(),
      catalogRepository.listAvailableSizes(),
    ]);

    return (
      <>
        <Hero models={allModels} promotedModels={promotedModels} promotions={promotions} />

        <div className="mx-auto max-w-[1320px] border-t border-ink/[0.08] px-[18px] py-9 sm:px-7 sm:py-16">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
            <h2 className="font-display text-[clamp(24px,3vw,34px)]">Nos univers de motifs</h2>
            <p className="max-w-[38ch] text-[14.5px] text-ink-mute">
              Chaque univers rassemble plusieurs modèles, du plus minéral au plus graphique.
            </p>
          </div>
          <UniversStrip types={types} models={allModels} />
        </div>

        {promotedModels.length > 0 && (
          <div className="mx-auto max-w-[1320px] border-t border-ink/[0.08] px-[18px] py-9 sm:px-7 sm:py-16">
            <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
              <h2 className="font-display text-[clamp(24px,3vw,34px)]">En ce moment</h2>
              <p className="max-w-[38ch] text-[14.5px] text-ink-mute">Une sélection à prix ajusté, pour un temps limité.</p>
            </div>
            <PromoSplit models={promotedModels} promotions={promotions} />
          </div>
        )}

        <Principles />

        <div className="mx-auto max-w-[1320px] px-[18px] py-9 sm:px-7 sm:py-16">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
            <h2 className="font-display text-[clamp(24px,3vw,34px)]">Des formats pensés pour chaque pièce</h2>
            <p className="max-w-[38ch] text-[14.5px] text-ink-mute">Les formats couvrent l&apos;essentiel des projets, du sol au mur.</p>
          </div>
          <FormatsGrid sizes={sizes} models={allModels} />
        </div>
      </>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1320px] px-[18px] py-20 sm:px-7">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger la page d'accueil pour le moment."} />
      </div>
    );
  }
}
