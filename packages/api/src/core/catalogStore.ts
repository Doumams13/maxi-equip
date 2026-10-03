import { getStorage } from "./storeServeur.js";
import type {
  ModeleCataloguePayload,
  ProduitCataloguePayload,
  PromotionCataloguePayload,
  ImageSyncPayload,
  ModeleRow,
  ProduitRow,
  ImageRow,
  PromotionRow,
} from "./serverStorage.js";

export type {
  ModeleCataloguePayload,
  ProduitCataloguePayload,
  PromotionCataloguePayload,
  ImageSyncPayload,
  ModeleRow,
  ProduitRow,
  ImageRow,
  PromotionRow,
} from "./serverStorage.js";
export { slugify } from "./serverStorage.js";

/**
 * Projection catalogue serveur — correction "Intégration Site Phase 5,
 * Partie 2 (pipeline catalogue)", adaptée au Bloc 1 (PostgreSQL) : ce
 * module délègue désormais à l'implémentation de stockage active
 * (SQLite ou PostgreSQL — voir storeServeur.ts/serverStorage.ts), sans
 * jamais dépendre d'un moteur SQL précis lui-même.
 *
 * SOURCE DE VÉRITÉ (décision explicite MAXI EQUIP, inchangée) : le
 * SQLite de l'application Electron reste l'unique source de vérité
 * MÉTIER du catalogue. Ce module ne fait que matérialiser une
 * PROJECTION de lecture. Jamais une seconde logique métier : les règles
 * de prix/promotion réellement appliquées restent celles de
 * `@maxi-equip/domain` (voir `publicCatalog.ts`).
 *
 * IDEMPOTENCE + ORDRE (inchangé) : chaque écriture applique un "upsert
 * si plus récent" — voir `serverStorage.ts`/les deux implémentations
 * pour le détail SQL.
 */

export function appliquerOperationModele(payload: ModeleCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationModele(payload);
}

export function appliquerOperationProduit(payload: ProduitCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationProduit(payload);
}

export function appliquerOperationPromotion(payload: PromotionCataloguePayload): Promise<{ applique: boolean }> {
  return getStorage().appliquerOperationPromotion(payload);
}

/**
 * Image — appliquée directement par la route `/v1/app/images/sync`
 * (jamais via `/v1/sync/push`, la taille d'un fichier réel dépasse la
 * limite générique des opérations JSON — voir `validationSync.ts`).
 */
export function upsertImageMeta(payload: ImageSyncPayload, fichier?: { url: string; filename: string }): Promise<{ applique: boolean }> {
  return getStorage().upsertImageMeta(payload, fichier);
}

export function findImageFilename(imageId: string): Promise<string | null> {
  return getStorage().findImageFilename(imageId);
}

// ==========================================================
// Lecture — utilisée par publicCatalog.ts pour construire les DTO publics.
// Aucune fonction de ce fichier ne renvoie de stock, fournisseur, coût
// d'achat ou seuil d'alerte — ces champs n'existent d'ailleurs dans
// AUCUNE des tables projetées (garantie structurelle, pas seulement un
// filtre applicatif), pour les deux implémentations de stockage.
// ==========================================================

export function listerModelesActifs(): Promise<ModeleRow[]> {
  return getStorage().listerModelesActifs();
}

export function listerProduitsActifs(): Promise<ProduitRow[]> {
  return getStorage().listerProduitsActifs();
}

export function listerImagesActives(): Promise<ImageRow[]> {
  return getStorage().listerImagesActives();
}

export function listerPromotionsActives(): Promise<PromotionRow[]> {
  return getStorage().listerPromotionsActives();
}
