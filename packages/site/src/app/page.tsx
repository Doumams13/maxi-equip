import { catalogRepository } from "@/services/catalog";
import { locationRepository } from "@/services/location";
import { Hero } from "@/components/home/Hero";
import { AdvantagesSection } from "@/components/home/AdvantagesSection";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { LocationsSection } from "@/components/home/LocationsSection";
import { ErrorState } from "@/components/ui/states";

// Revalidation courte : le catalogue/les promotions peuvent changer souvent
// une fois branchés sur l'API réelle (mise à jour depuis l'application
// Windows). En mock, cela n'a pas d'effet visible mais prépare l'intégration.
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
        <Hero featuredModels={featured} promotions={promotions} />
        <AdvantagesSection />
        <CategoryGrid />
        <FeaturedProducts models={featured} promotions={promotions} />
        <LocationsSection locations={locations} />
      </>
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <ErrorState
          description={
            error instanceof Error
              ? error.message
              : "Impossible de charger la page d'accueil pour le moment."
          }
        />
      </div>
    );
  }
}
