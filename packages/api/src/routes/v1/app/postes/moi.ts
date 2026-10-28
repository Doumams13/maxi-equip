import type { Route } from "../../../../core/types.js";
import { getPoste } from "../../../../core/posteStore.js";

/**
 * GET /v1/app/postes/moi — système multiposte fiable (2026-10-28).
 * Renvoie la ligne `postes` correspondant au `sub` du jeton de
 * l'appelant (lui-même devenu l'identifiant technique du poste, voir
 * serverStorage.ts/PosteRow) — permet au Renderer de savoir si CE
 * poste a déjà un nom choisi (voir `nom: null` juste après une
 * restauration) sans jamais exposer les autres postes à cet usage.
 *
 * `poste: null` pour un jeton antérieur à cette correction (ex. PC
 * Shop avant sa bascule via le bouton Administrateur de Paramètres,
 * voir posteSyncService.ts côté Electron) — jamais une erreur, ce
 * jeton reste par ailleurs valide pour toutes les autres routes.
 */
export const postesMoiRoute: Route = {
  method: "GET",
  path: "/app/postes/moi",
  trustLevel: "app",
  handler: async (req) => {
    const poste = await getPoste(req.auth!.sub);
    return { status: 200, body: { poste } };
  },
};
