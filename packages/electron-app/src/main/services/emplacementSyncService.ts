import { getConfigurationSync } from "./syncConfig.js";

const DELAI_MAX_REQUETE_MS = 15_000;

export type ResultatLectureEmplacements =
  | {
      success: true;
      emplacements: { id: string; nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean; actif: boolean }[];
    }
  | { success: false; message: string };

/**
 * Rattrapage périodique des dépôts centralisés — correction "visibilité
 * croisée Factures/Historique entre postes" (2026-10-27). Préalable
 * bloquant à cette fonctionnalité : sans id de dépôt partagé entre
 * postes, aucune facture/mouvement reçu d'un autre poste ne pourrait
 * jamais résoudre sa clé étrangère locale `emplacement_id`. Appelé à
 * chaque cycle de synchronisation (voir SyncService), exactement comme
 * `ValidationStockDistanteService.recupererStockCentral` — relecture
 * intégrale, jamais une pagination/un filtre, le volume reste trivial.
 *
 * Sur un poste où la synchronisation N'EST PAS configurée, ce service
 * n'est jamais appelé (même garde que les autres rattrapages).
 */
export class EmplacementSyncService {
  async recupererEmplacementsActifs(): Promise<ResultatLectureEmplacements> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/emplacements/list`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as {
        emplacements: { id: string; nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean; actif: boolean }[];
      };
      return { success: true, emplacements: corps.emplacements };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
