import { getStorage } from "./storeServeur.js";
import type { DemandeValidationStock, ResultatValidationStock } from "./serverStorage.js";

export type { DemandeValidationStock, ResultatValidationStock } from "./serverStorage.js";

/**
 * Validation atomique d'une opération de stock partagé — correction
 * "travailler en parallèle sur le même stock" (2026-10-22). Simple façade
 * sur `getStorage()`, même principe que `identiteStore.ts`/`compteStore.ts`
 * — voir serverStorage.ts (DemandeValidationStock) pour le raisonnement
 * complet, et `routes/v1/app/operations/valider.ts` pour la seule route
 * qui l'appelle.
 */
export function validerEtAppliquerOperationStock(demande: DemandeValidationStock): Promise<ResultatValidationStock> {
  return getStorage().validerEtAppliquerOperationStock(demande);
}
