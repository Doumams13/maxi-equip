import { getStorage } from "./storeServeur.js";
import type { CompteCataloguePayload, CompteRow, CompteCatchupRow } from "./serverStorage.js";

export type { CompteCataloguePayload, CompteRow, CompteCatchupRow } from "./serverStorage.js";

/**
 * Comptes utilisateurs centralisés — correction "travail à distance /
 * plusieurs machines en parallèle" (2026-10-22). Même principe que
 * `identiteStore.ts`/`catalogStore.ts` (dont ce module reprend
 * délibérément le style, jamais une seconde logique) : simple façade sur
 * `getStorage()`, aucune règle métier ici — voir serverStorage.ts pour le
 * raisonnement complet et `routes/v1/app/auth/login.ts` pour la seule
 * route qui lit réellement ces comptes pour authentifier quelqu'un.
 */
export function appliquerOperationCompte(payload: CompteCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationCompte(payload);
}

export function trouverCompteParIdentifiant(identifiant: string): Promise<CompteRow | null> {
  return getStorage().trouverCompteParIdentifiant(identifiant);
}

/**
 * Rattrapage proactif — correction "visibilité croisée Factures/
 * Historique entre postes" (2026-10-27), Phase 1. Voir
 * `CompteCatchupRow` (serverStorage.ts) pour le raisonnement complet et
 * `routes/v1/app/comptes/list.ts` pour la seule route qui l'appelle.
 */
export function listerComptesActifs(): Promise<CompteCatchupRow[]> {
  return getStorage().listerComptesActifs();
}
