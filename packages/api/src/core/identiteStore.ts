import { getStorage } from "./storeServeur.js";
import type { IdentiteCataloguePayload, IdentiteRow } from "./serverStorage.js";

export type { IdentiteCataloguePayload, IdentiteRow } from "./serverStorage.js";

/**
 * Projection identité entreprise — correction "L'appli gère les infos
 * du site". Même principe que `catalogStore.ts` (dont ce module reprend
 * délibérément le style, jamais une seconde logique) : SOURCE DE VÉRITÉ
 * MÉTIER = l'application Electron (écran Paramètres) ; ce module ne
 * matérialise qu'une PROJECTION de lecture pour le site public. Upsert
 * "si plus récent" (idempotence + ordre), voir les deux implémentations
 * de `ServerStorage` pour le détail SQL.
 */
export function appliquerOperationIdentite(payload: IdentiteCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationIdentite(payload);
}

export function getIdentiteActuelle(): Promise<IdentiteRow | null> {
  return getStorage().getIdentiteActuelle();
}
