import type { Route } from "../../../core/types.js";
import { construireModelesPublics } from "../../../core/publicCatalog.js";

/**
 * GET /v1/public/catalog/models — catalogue public complet (modèles
 * actifs avec leurs variantes/images). Correction "Intégration Site
 * Phase 5, Partie 3" : pas de filtrage/tri côté API — ce sont des
 * fonctions PURES déjà écrites et testées côté site
 * (`services/catalog/filterModels.ts`, extraites de
 * `mockCatalogRepository.ts`) ; les dupliquer ici créerait exactement la
 * "seconde logique métier contradictoire" que la Phase 5 interdit
 * explicitement. Le catalogue d'un magasin de carrelage reste de taille
 * raisonnable (dizaines à centaines de modèles) — renvoyer l'ensemble en
 * une fois, mis en cache côté site (voir apiCatalogRepository.ts), est
 * la solution la plus simple qui reste correcte.
 */
export const publicCatalogModelsRoute: Route = {
  method: "GET",
  path: "/public/catalog/models",
  trustLevel: "public",
  handler: async () => ({ status: 200, body: { models: await construireModelesPublics() } }),
};
