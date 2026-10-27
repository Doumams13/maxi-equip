import { getStorage } from "./storeServeur.js";
import type { EmplacementCataloguePayload, EmplacementRow } from "./serverStorage.js";

export type { EmplacementCataloguePayload, EmplacementRow } from "./serverStorage.js";

/**
 * Dépôts/points de vente centralisés — correction "visibilité croisée
 * Factures/Historique entre postes" (2026-10-27). Même principe que
 * `compteStore.ts` (dont ce module reprend délibérément le style,
 * jamais une seconde logique) : simple façade sur `getStorage()`,
 * aucune règle métier ici — voir serverStorage.ts
 * (EmplacementCataloguePayload) pour le raisonnement complet et
 * `routes/v1/app/emplacements/list.ts` pour la seule route qui relit
 * cette projection.
 */
export function appliquerOperationEmplacement(payload: EmplacementCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationEmplacement(payload);
}

export function listerEmplacementsActifs(): Promise<EmplacementRow[]> {
  return getStorage().listerEmplacementsActifs();
}
