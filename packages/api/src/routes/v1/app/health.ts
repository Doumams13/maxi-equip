import type { Route } from "../../../core/types.js";

/**
 * Route "application" de test — n'est atteinte que si le routeur a validé
 * la présence d'une authentification (voir core/router.ts). Les vraies
 * routes de synchronisation (push/pull par lots — Corrections §3/§4)
 * seront ajoutées en Phase 3.
 */
export const healthRoute: Route = {
  method: "GET",
  path: "/app/health",
  trustLevel: "app",
  handler: () => ({ status: 200, body: { ok: true, scope: "app" } }),
};
