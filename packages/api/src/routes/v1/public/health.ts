import type { Route } from "../../../core/types.js";

/**
 * Route publique de test — prouve qu'un point d'entrée "public" fonctionne
 * sans authentification. Les vraies routes publiques (catalogue filtré,
 * promotions, création de demande — Synthèse §5) seront ajoutées en
 * Phase 3/4, avec le filtrage strict du stock déjà spécifié.
 */
export const healthRoute: Route = {
  method: "GET",
  path: "/public/health",
  trustLevel: "public",
  handler: () => ({ status: 200, body: { ok: true, scope: "public" } }),
};
