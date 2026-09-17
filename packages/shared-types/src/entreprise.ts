import type { ISODateTime } from "./common.js";

/**
 * Paramètres globaux de l'entreprise — un seul enregistrement ("singleton").
 * Cahier des charges §13 : modifiable uniquement par l'administrateur,
 * répercuté partout où c'est pertinent (interfaces, factures).
 * La charte graphique officielle n'a pas encore été fournie par MAXI EQUIP ;
 * `logoUrl` peut donc être `null` (fallback visuel géré côté design-system).
 *
 * `updatedAt` est nécessaire pour que le système de synchronisation puisse
 * détecter un changement sur ce singleton — sans ce champ, une modification
 * des paramètres entreprise n'est jamais propagée aux autres installations.
 */
export interface ParametresEntreprise {
  nom: string;
  logoUrl: string | null;
  adresse: string;
  ville: string;
  telephone: string;
  email: string;
  whatsapp: string;
  updatedAt: ISODateTime;
}
