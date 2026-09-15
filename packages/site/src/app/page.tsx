import { catalogRepository } from "@/services/catalog";
import { locationRepository } from "@/services/location";
import { Hero } from "@/components/home/Hero";
import { CollectionsIndex } from "@/components/home/CollectionsIndex";
import { FeaturedSpreads } from "@/components/home/FeaturedSpreads";
import { AdvantagesRoom } from "@/components/home/AdvantagesRoom";
import { LocationsSection } from "@/components/home/LocationsSection";
import { ErrorState } from "@/components/ui/states";

export const revalidate = 60;

export default async function HomePage() {
  try {
    const [featured, promotions, locations] = await Promise.all([
      catalogRepository.listFeaturedModels(),
      catalogRepository.listPromotions(),
      locationRepository.listLocations(),
    ]);

    return (
      <>
        <Hero featuredModel={featured[0]} />
        <CollectionsIndex />
        <FeaturedSpreads models={featured} promotions={promotions} />
        <AdvantagesRoom />
        <LocationsSection locations={locations} />
      </>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger la page d'accueil pour le moment."} />
      </div>
    );
  }
}
