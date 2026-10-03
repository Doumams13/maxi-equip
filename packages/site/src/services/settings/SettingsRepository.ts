import type { CompanySettings } from "@/lib/types/settings";

export interface SettingsRepository {
  getSettings(): Promise<CompanySettings>;
}
