import { siteConfig } from "@/config/site";
import type { CompanySettings } from "@/lib/types/settings";
import type { SettingsRepository } from "./SettingsRepository";

/**
 * Mock — comportement STRICTEMENT identique à avant cette correction :
 * reflète telles quelles les valeurs statiques de `config/site.ts`,
 * jamais un changement de comportement quand aucune API n'est configurée
 * (même principe que les autres dépôts mock du site).
 */
export class MockSettingsRepository implements SettingsRepository {
  async getSettings(): Promise<CompanySettings> {
    return Promise.resolve({
      nom: siteConfig.companyName,
      adresse: null,
      quartier: siteConfig.city,
      telephones: [siteConfig.contact.phoneDisplay],
      whatsapp: siteConfig.contact.whatsappNumberIntl,
      email: siteConfig.contact.email,
    });
  }
}

/** Correction "L'appli gère les infos du site" : consomme GET /v1/public/settings (voir routes/v1/public/settings.ts côté API). */
export class ApiSettingsRepository implements SettingsRepository {
  constructor(private readonly baseUrl: string) {}

  async getSettings(): Promise<CompanySettings> {
    const res = await fetch(`${this.baseUrl}/v1/public/settings`, { next: { revalidate: 300 } });
    if (!res.ok) {
      throw new Error(`Réponse inattendue de l'API MAXI EQUIP (${res.status}) pour /v1/public/settings.`);
    }
    const corps = (await res.json()) as { settings: CompanySettings };
    return corps.settings;
  }
}

/** Même interrupteur que le catalogue/les localisations (services/catalog/index.ts, services/location/index.ts). */
function createSettingsRepository(): SettingsRepository {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return new ApiSettingsRepository(apiBaseUrl);
  }
  return new MockSettingsRepository();
}

export const settingsRepository: SettingsRepository = createSettingsRepository();

/** Coordonnées prêtes à afficher — jamais un champ vide affiché à l'écran. */
export interface EffectiveContactInfo {
  /**
   * BUG CORRIGÉ ("Nom du magasin jamais utilisé sur le site") : `nom`
   * existait bien dans `CompanySettings`/l'API, mais n'était jamais
   * recopié ici — toutes les pages affichaient `siteConfig.companyName`
   * en dur à la place, peu importe la valeur configurée dans l'écran
   * Paramètres de l'application.
   */
  nom: string;
  telephone: string;
  whatsapp: string;
  email: string;
  quartier: string;
  /**
   * BUG CORRIGÉ ("adresse configurée dans l'app invisible sur le site") :
   * ce champ existe bien dans `CompanySettings`/l'API (`/v1/public/settings`),
   * mais n'était jamais recopié ici ni donc jamais exposé au Footer.
   * Contrairement aux autres champs, `config/site.ts` n'a pas d'adresse
   * statique de repli — `null` tant qu'elle n'a jamais été configurée
   * dans l'application, jamais une valeur inventée.
   */
  adresse: string | null;
}

/**
 * Fusionne les coordonnées réellement synchronisées depuis l'application
 * avec le repli statique de `config/site.ts` — CHAMP PAR CHAMP : tant
 * qu'une donnée précise n'a pas encore été synchronisée (ou que l'API
 * n'est pas configurée), son repli reste affiché, jamais un champ vide
 * ni une valeur inventée. Si `/v1/public/settings` est injoignable (API
 * configurée mais temporairement indisponible), replie intégralement sur
 * `config/site.ts` plutôt que de casser l'affichage des coordonnées de
 * contact — jamais un problème d'API qui empêche un client d'appeler
 * MAXI EQUIP.
 */
export async function getEffectiveContactInfo(): Promise<EffectiveContactInfo> {
  try {
    const settings = await settingsRepository.getSettings();
    return {
      nom: settings.nom || siteConfig.companyName,
      telephone: settings.telephones[0] || siteConfig.contact.phoneDisplay,
      whatsapp: settings.whatsapp || siteConfig.contact.whatsappNumberIntl,
      email: settings.email || siteConfig.contact.email,
      quartier: settings.quartier || siteConfig.city,
      adresse: settings.adresse || null,
    };
  } catch {
    return {
      nom: siteConfig.companyName,
      telephone: siteConfig.contact.phoneDisplay,
      whatsapp: siteConfig.contact.whatsappNumberIntl,
      email: siteConfig.contact.email,
      quartier: siteConfig.city,
      adresse: null,
    };
  }
}
