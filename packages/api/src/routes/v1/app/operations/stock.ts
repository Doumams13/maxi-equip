import type { Route } from "../../../../core/types.js";
import { listerStockCentral } from "../../../../core/operationsStockStore.js";

/**
 * GET /v1/app/operations/stock — correction "vente sur un poste annexe
 * non répercutée sur le PC Shop après 10+ minutes" (2026-10-27).
 *
 * `stock_central` est déjà la source de vérité partagée, mais jusqu'ici
 * rien ne la relisait jamais côté client : un poste ne met à jour sa
 * copie LOCALE d'un produit que lorsqu'IL réalise lui-même une opération
 * validée en ligne sur ce produit (voir VenteService/StockService, qui
 * appliquent `stockApres`). Un poste resté inactif sur un produit ne
 * voyait donc jamais les ventes faites ailleurs, même indéfiniment —
 * cette route permet un rattrapage périodique (voir
 * SyncService.executerSynchronisation, même principe que le rattrapage
 * des images manquantes).
 *
 * Lecture intégrale, jamais paginée/filtrée (même choix que
 * `/app/images/list`) — le volume reste celui du catalogue produit ×
 * dépôt.
 */
export const stockCentralRoute: Route = {
  method: "GET",
  path: "/app/operations/stock",
  trustLevel: "app",
  handler: async () => {
    const lignes = await listerStockCentral();
    return { status: 200, body: { lignes } };
  },
};
