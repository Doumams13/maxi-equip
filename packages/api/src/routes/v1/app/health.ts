import type { Route } from "../../../core/types.js";

/**
 * Route "application" de test — n'est atteinte que si le routeur a
 * réellement validé un JWT (voir core/router.ts). Les vraies routes de
 * synchronisation (push/pull par lots — Corrections §3/§4) seront
 * ajoutées en Phase 3.6, pas ici. `req.auth` est déjà disponible pour
 * ces futures routes (Partie 4, point 9 de la correction "Sécurisation
 * de l'API") — jamais renseigné à partir d'une simple présence de
 * jeton, uniquement après une vérification cryptographique réelle.
 */
export const healthRoute: Route = {
  method: "GET",
  path: "/app/health",
  trustLevel: "app",
  handler: (req) => ({ status: 200, body: { ok: true, scope: "app", sub: req.auth?.sub } }),
};
