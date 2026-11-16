import { getConfigurationSync } from "./syncConfig.js";

const DELAI_MAX_REQUETE_MS = 15_000;

export interface CategorieCatalogueCatchup {
  id: string;
  nom: string;
  imageDataUrl: string | null;
  ordre: number;
  updatedAt: string;
  /** Phase 5 (référentiel commun), sous-phase 5.6 — tombstone reçu d'un autre poste (voir CategorieRepository.creerDepuisServeur). */
  deletedAt?: string | null;
}

export interface SousCategorieCatalogueCatchup {
  id: string;
  categorieId: string;
  nom: string;
  ordre: number;
  modelePhysique: "carreau" | null;
  unitesAutorisees: Array<"carton" | "piece" | "sac" | "metre" | "kg" | "litre"> | null;
  updatedAt: string;
  /** Phase 5 (référentiel commun), sous-phase 5.6 — tombstone reçu d'un autre poste (voir SousCategorieRepository.creerDepuisServeur). */
  deletedAt?: string | null;
}

export interface SousCategorieChampCatalogueCatchup {
  id: string;
  sousCategorieId: string;
  nom: string;
  type: "texte" | "nombre" | "liste";
  obligatoire: boolean;
  valeursAutorisees: string[] | null;
  uniteMesure: string | null;
  role: "descriptif" | "physique" | "calcul" | null;
  ordre: number;
  updatedAt: string;
  /** Tombstone reçu d'un autre poste (capacité déjà prête depuis la sous-phase 5.4, désormais réellement atteignable par le réseau — voir §3 du rapport de la sous-phase 5.6). */
  deletedAt?: string | null;
}

export type ResultatLectureReferentiel =
  | {
      success: true;
      categories: CategorieCatalogueCatchup[];
      sousCategories: SousCategorieCatalogueCatchup[];
      sousCategorieChamps: SousCategorieChampCatalogueCatchup[];
    }
  | { success: false; message: string };

/**
 * Rattrapage périodique du référentiel commun (catégories/sous-
 * catégories/champs) — Phase 5, sous-phase 5.4. Même principe exact que
 * `CatalogueSyncService`/`EmplacementSyncService`/`CompteSyncService` :
 * relecture intégrale, appelé à chaque cycle de synchronisation, jamais
 * une boucle `setInterval` indépendante (câblée dans `SyncService`, pas
 * ici).
 *
 * Sur un poste où la synchronisation N'EST PAS configurée, ce service
 * n'est jamais appelé (même garde que les autres rattrapages).
 *
 * Phase 5 (référentiel commun), sous-phase 5.6 — `/v1/app/referentiel/list`
 * renvoie désormais AUSSI les entités supprimées (tombstone, `deletedAt`
 * renseigné), contrairement à `CatalogueSyncService`/modèle/produit (qui
 * restent filtrés sur les entités actives, hors périmètre de cette
 * sous-phase) : une suppression de catégorie/sous-catégorie/champ
 * effectuée sur un poste est donc désormais reçue et appliquée par les
 * autres (voir CategorieRepository/SousCategorieRepository/
 * SousCategorieChampRepository.creerDepuisServeur).
 */
export class ReferentielSyncService {
  async recupererReferentiel(): Promise<ResultatLectureReferentiel> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/referentiel/list`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as {
        categories: CategorieCatalogueCatchup[];
        sousCategories: SousCategorieCatalogueCatchup[];
        sousCategorieChamps: SousCategorieChampCatalogueCatchup[];
      };
      return { success: true, categories: corps.categories, sousCategories: corps.sousCategories, sousCategorieChamps: corps.sousCategorieChamps };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
