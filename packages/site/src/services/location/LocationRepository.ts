import type { CompanyLocation } from "@/lib/types/catalog";

export interface LocationRepository {
  listLocations(): Promise<CompanyLocation[]>;
}
