import { getConfigurationSync } from "./syncConfig.js";

const DELAI_MAX_REQUETE_MS = 15_000;

export type ResultatLectureComptes =
  | { success: true; comptes: { id: string; identifiant: string; nom: string; role: "administrateur" | "gerant"; actif: boolean }[] }
  | { success: false; message: string };

/**
 * Rattrapage périodique des comptes centralisés — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * Phase 1. Jusqu'ici un compte n'était mirroré localement sur un poste
 * donné qu'au moment où IL s'y connectait lui-même (voir
 * `AuthService.loginEnLigne` →
 * `UtilisateurRepository.upsertDepuisConnexionCentrale`) — jamais de
 * façon proactive. Débloque les FK locales
 * `factures.vendeur_utilisateur_id`/`mouvements.utilisateur_id` pour un
 * vendeur qui ne s'est jamais connecté sur CE poste précis. Appelé à
 * chaque cycle de synchronisation (voir SyncService), même principe que
 * `EmplacementSyncService`/`ValidationStockDistanteService` — relecture
 * intégrale, jamais une pagination/un filtre.
 *
 * Sur un poste où la synchronisation N'EST PAS configurée, ce service
 * n'est jamais appelé (même garde que les autres rattrapages).
 */
export class CompteSyncService {
  async recupererComptesActifs(): Promise<ResultatLectureComptes> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/comptes/list`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as {
        comptes: { id: string; identifiant: string; nom: string; role: "administrateur" | "gerant"; actif: boolean }[];
      };
      return { success: true, comptes: corps.comptes };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
