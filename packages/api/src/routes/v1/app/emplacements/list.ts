import type { Route } from "../../../../core/types.js";
import { listerEmplacementsActifs } from "../../../../core/emplacementStore.js";

/**
 * GET /v1/app/emplacements/list — correction "visibilité croisée
 * Factures/Historique entre postes" (2026-10-27).
 *
 * Préalable bloquant à cette fonctionnalité : sans un id de dépôt
 * partagé entre postes, aucune facture/mouvement reçu d'un autre poste
 * ne pourrait jamais résoudre sa clé étrangère locale `emplacement_id`
 * (`factures.emplacement_id`/`mouvements.emplacement_id` sont de vraies
 * contraintes FK, voir schema.sql). Relecture intégrale (jamais
 * paginée/filtrée), même principe que `/app/images/list` et
 * `/app/operations/stock` — le volume reste celui du nombre de dépôts,
 * trivial.
 *
 * Pas de restriction de rôle au niveau de cette route (le jeton
 * d'installation ne porte pas d'identité par utilisateur) — la lecture
 * seule des dépôts ne présente aucun risque, contrairement aux actions
 * de réconciliation (côté Electron, Administrateur uniquement).
 */
export const emplacementsListRoute: Route = {
  method: "GET",
  path: "/app/emplacements/list",
  trustLevel: "app",
  handler: async () => {
    const emplacements = await listerEmplacementsActifs();
    return { status: 200, body: { emplacements } };
  },
};
