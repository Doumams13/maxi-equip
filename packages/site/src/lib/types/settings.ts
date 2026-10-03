/**
 * Coordonnées de l'entreprise réellement gérées depuis l'application
 * Electron (écran Paramètres > Identité) — correction "L'appli gère les
 * infos du site". `null`/tableau vide = pas encore synchronisé (ou
 * volontairement laissé vide côté app) — jamais une valeur inventée ici,
 * voir services/settings/index.ts pour le repli sur `config/site.ts`.
 */
export interface CompanySettings {
  nom: string | null;
  adresse: string | null;
  quartier: string | null;
  telephones: string[];
  whatsapp: string | null;
  email: string | null;
}
