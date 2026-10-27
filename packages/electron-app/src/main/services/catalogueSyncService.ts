import { getConfigurationSync } from "./syncConfig.js";

const DELAI_MAX_REQUETE_MS = 15_000;

export interface ModeleCatalogueCatchup {
  id: string;
  motif: string;
  type: string;
  ordreVitrine: number | null;
}

export interface ProduitCatalogueCatchup {
  id: string;
  modeleId: string;
  taille: string;
  tailleTri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  prix: number;
}

export type ResultatLectureCatalogue =
  | { success: true; modeles: ModeleCatalogueCatchup[]; produits: ProduitCatalogueCatchup[] }
  | { success: false; message: string };

/**
 * Rattrapage périodique du catalogue (modèles/produits) — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * Phase 2. Débloque la clé étrangère locale `mouvements.produit_id`
 * (NOT NULL) pour un produit créé sur un autre poste — les ventes n'en
 * ont pas besoin (`lignes_facture.produit_id` nullable, dénormalisée).
 * Même principe que `EmplacementSyncService`/`CompteSyncService` —
 * relecture intégrale, appelé à chaque cycle de synchronisation.
 *
 * Sur un poste où la synchronisation N'EST PAS configurée, ce service
 * n'est jamais appelé (même garde que les autres rattrapages).
 */
export class CatalogueSyncService {
  async recupererCatalogue(): Promise<ResultatLectureCatalogue> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/catalogue/list`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as { modeles: ModeleCatalogueCatchup[]; produits: ProduitCatalogueCatchup[] };
      return { success: true, modeles: corps.modeles, produits: corps.produits };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
