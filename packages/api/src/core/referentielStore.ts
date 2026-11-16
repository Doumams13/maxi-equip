import { getStorage } from "./storeServeur.js";
import type {
  CategorieCataloguePayload,
  CategorieRow,
  SousCategorieCataloguePayload,
  SousCategorieRow,
  SousCategorieChampCataloguePayload,
  SousCategorieChampRow,
} from "./serverStorage.js";

export type {
  CategorieCataloguePayload,
  CategorieRow,
  SousCategorieCataloguePayload,
  SousCategorieRow,
  SousCategorieChampCataloguePayload,
  SousCategorieChampRow,
} from "./serverStorage.js";

/**
 * Référentiel commun du catalogue — Phase 5 (voir
 * PHASE_5_CAHIER_DES_CHARGES.md). Même style délibéré que
 * `compteStore.ts`/`emplacementStore.ts` : simple façade sur
 * `getStorage()`, aucune règle métier ici — voir serverStorage.ts
 * (CategorieCataloguePayload et suivants) pour le raisonnement complet.
 *
 * Fichier dédié plutôt qu'une extension de `catalogStore.ts` : ce
 * référentiel (catégories/sous-catégories/champs) n'alimente JAMAIS
 * `publicCatalog.ts` ni le site public, contrairement à `catalogStore.ts`
 * (modèle/produit/promotion/image) — une séparation de fichiers rend
 * cette frontière évidente à la lecture, pas seulement par convention.
 *
 * Sous-phase 5.1 (fondations serveur) : ce module est prêt à être
 * consommé par un futur endpoint `/v1/app/referentiel/list` (sous-phase
 * 5.2) et par le routage de `/v1/sync/push` (sous-phase 5.3) — AUCUN des
 * deux n'est câblé à ce stade, conformément au périmètre validé de cette
 * sous-phase.
 */

export function appliquerOperationCategorie(payload: CategorieCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationCategorie(payload);
}

export function appliquerOperationSousCategorie(payload: SousCategorieCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationSousCategorie(payload);
}

export function appliquerOperationSousCategorieChamp(payload: SousCategorieChampCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationSousCategorieChamp(payload);
}

export function listerCategoriesActives(): Promise<CategorieRow[]> {
  return getStorage().listerCategoriesActives();
}

export function listerSousCategoriesActives(): Promise<SousCategorieRow[]> {
  return getStorage().listerSousCategoriesActives();
}

export function listerSousCategorieChampsActifs(): Promise<SousCategorieChampRow[]> {
  return getStorage().listerSousCategorieChampsActifs();
}
