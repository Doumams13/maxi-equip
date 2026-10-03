import { mockLocations } from "@/mock/locations";
import type { CompanyLocation } from "@/lib/types/catalog";
import type { LocationRepository } from "./LocationRepository";

export class MockLocationRepository implements LocationRepository {
  async listLocations(): Promise<CompanyLocation[]> {
    return Promise.resolve(mockLocations);
  }
}

/** Correction "Intégration Site Phase 5, Partie 3" : consomme GET /v1/public/locations (voir routes/v1/public/locations.ts côté API). */
export class ApiLocationRepository implements LocationRepository {
  constructor(private readonly baseUrl: string) {}

  async listLocations(): Promise<CompanyLocation[]> {
    const res = await fetch(`${this.baseUrl}/v1/public/locations`, { next: { revalidate: 300 } });
    if (!res.ok) {
      throw new Error(`Réponse inattendue de l'API MAXI EQUIP (${res.status}) pour /v1/public/locations.`);
    }
    const corps = (await res.json()) as { locations: CompanyLocation[] };
    return corps.locations;
  }
}

/**
 * Correction "Intégration Site Phase 5, Partie 3" : même interrupteur que
 * le catalogue (services/catalog/index.ts) — une seule variable
 * d'environnement active toute l'intégration réelle du site.
 */
function createLocationRepository(): LocationRepository {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return new ApiLocationRepository(apiBaseUrl);
  }
  return new MockLocationRepository();
}

export const locationRepository: LocationRepository = createLocationRepository();
