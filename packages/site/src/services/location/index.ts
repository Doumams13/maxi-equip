import { mockLocations } from "@/mock/locations";
import type { CompanyLocation } from "@/lib/types/catalog";
import type { LocationRepository } from "./LocationRepository";

export class MockLocationRepository implements LocationRepository {
  async listLocations(): Promise<CompanyLocation[]> {
    return Promise.resolve(mockLocations);
  }
}

/**
 * Non utilisée en Phase 5 — squelette pour l'intégration future avec
 * GET /v1/public/locations. Voir services/catalog/apiCatalogRepository.ts
 * pour le raisonnement complet.
 */
export class ApiLocationRepository implements LocationRepository {
  constructor(private readonly baseUrl: string) {}

  listLocations(): Promise<CompanyLocation[]> {
    throw new Error(
      `ApiLocationRepository.listLocations n'est pas implémenté (API non disponible pour cette phase). baseUrl: ${this.baseUrl || "(aucune)"}`
    );
  }
}

function createLocationRepository(): LocationRepository {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return new ApiLocationRepository(apiBaseUrl);
  }
  return new MockLocationRepository();
}

export const locationRepository: LocationRepository = createLocationRepository();
