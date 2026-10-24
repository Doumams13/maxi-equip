import type { Route } from "../../../../core/types.js";
import { listerImagesActives } from "../../../../core/catalogStore.js";

/**
 * GET /v1/app/images/list — correction "photos de carreaux absentes sur
 * un poste restauré/secondaire" (2026-10-24).
 *
 * Permet à un poste Electron (restauration d'installation OU simple
 * synchronisation périodique sur un deuxième poste) de savoir quelles
 * images existent côté serveur et où les retélécharger — jusqu'ici les
 * photos ne circulaient QUE dans le sens poste → serveur (voir
 * routes/v1/app/images/sync.ts), jamais l'inverse.
 *
 * Réutilise `listerImagesActives()` TEL QUEL (déjà utilisée par le
 * catalogue public) : malgré son nom, elle ne filtre PAS par produit
 * actif — uniquement par image elle-même non supprimée et déjà
 * téléversée (`url IS NOT NULL`). Couvre donc aussi les carreaux
 * archivés/inactifs, jamais seulement ceux visibles sur le site vitrine.
 */
export const imagesListRoute: Route = {
  method: "GET",
  path: "/app/images/list",
  trustLevel: "app",
  handler: async () => {
    const images = await listerImagesActives();
    return { status: 200, body: { images } };
  },
};
