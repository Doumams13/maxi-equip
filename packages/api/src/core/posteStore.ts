import { getStorage } from "./storeServeur.js";
import type { PosteRow, ResultatCreationPosteAnnexe } from "./serverStorage.js";

export type { PosteRow, ResultatCreationPosteAnnexe } from "./serverStorage.js";

/**
 * Identité et autorisation des postes — système multiposte fiable
 * (2026-10-28). Même principe que `emplacementStore.ts`/`compteStore.ts` :
 * simple façade sur `getStorage()`, aucune règle métier ici — voir
 * serverStorage.ts (PosteRow) pour le raisonnement complet et
 * `routes/v1/app/postes/*.ts` pour les routes qui l'utilisent.
 */
export function getPoste(id: string): Promise<PosteRow | null> {
  return getStorage().getPoste(id);
}

export function listerPostes(): Promise<PosteRow[]> {
  return getStorage().listerPostes();
}

export function creerPosteAnnexeSiLimiteNonAtteinte(maintenant: string): Promise<ResultatCreationPosteAnnexe> {
  return getStorage().creerPosteAnnexeSiLimiteNonAtteinte(maintenant);
}

export function obtenirOuCreerPosteShop(maintenant: string): Promise<PosteRow> {
  return getStorage().obtenirOuCreerPosteShop(maintenant);
}

export function definirNomPoste(id: string, nom: string, maintenant: string): Promise<{ applique: boolean }> {
  return getStorage().definirNomPoste(id, nom, maintenant);
}

export function bloquerPoste(id: string, maintenant: string): Promise<{ applique: boolean }> {
  return getStorage().bloquerPoste(id, maintenant);
}

export function reautoriserPoste(id: string, maintenant: string): Promise<{ applique: boolean }> {
  return getStorage().reautoriserPoste(id, maintenant);
}

export function retirerPoste(id: string): Promise<{ applique: boolean }> {
  return getStorage().retirerPoste(id);
}
