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

/**
 * Correction "Intégration Site Phase 5" : même raisonnement que
 * services/catalog/index.ts — aucun mécanisme réel de synchronisation
 * des localisations n'existe encore, contrairement à la soumission de
 * demandes. Reste volontairement mocké, indépendamment de
 * NEXT_PUBLIC_API_BASE_URL.
 */
function createLocationRepository(): LocationRepository {
  return new MockLocationRepository();
}

export const locationRepository: LocationRepository = createLocationRepository();
