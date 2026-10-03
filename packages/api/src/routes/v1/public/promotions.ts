import type { Route } from "../../../core/types.js";
import { construirePromotionsPubliques } from "../../../core/publicCatalog.js";

/**
 * GET /v1/public/promotions — toutes les promotions connues (actives,
 * expirées, futures), déjà résolues par variante (voir
 * `publicCatalog.ts`). Le filtrage par validité temporelle reste une
 * responsabilité du site (`lib/pricing.ts`), inchangée depuis les
 * données mockées.
 */
export const publicPromotionsRoute: Route = {
  method: "GET",
  path: "/public/promotions",
  trustLevel: "public",
  handler: async () => ({ status: 200, body: { promotions: await construirePromotionsPubliques() } }),
};
