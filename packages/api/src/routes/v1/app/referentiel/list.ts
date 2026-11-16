import type { Route } from "../../../../core/types.js";
import { listerCategoriesActives, listerSousCategoriesActives, listerSousCategorieChampsActifs } from "../../../../core/referentielStore.js";

/**
 * GET /v1/app/referentiel/list — Phase 5 (référentiel commun), sous-phase
 * 5.2. Même principe que `/app/catalogue/list`/`/app/emplacements/list`/
 * `/app/comptes/list` : relecture intégrale, en lecture seule, des 3
 * projections référentielles — jamais une écriture.
 *
 * Endpoint DÉDIÉ, jamais une extension de `/app/catalogue/list`
 * (décision validée, §5.4 du cahier des charges) : ce référentiel
 * (catégories/sous-catégories/champs) change beaucoup plus rarement que
 * modèle/produit, et n'alimente jamais `publicCatalog.ts`/le site public
 * — une route séparée rend cette frontière évidente, pas seulement par
 * convention de fichier (voir `referentielStore.ts`).
 *
 * Les unités autorisées ne sont PAS une 4ᵉ collection : elles voyagent
 * comme sous-objet de chaque sous-catégorie (`unitesAutorisees`, déjà
 * porté par `SousCategorieRow`, voir serverStorage.ts) — cohérent avec
 * le choix déjà fait au push (§4.6/§7.3 du cahier des charges).
 */
export const referentielListRoute: Route = {
  method: "GET",
  path: "/app/referentiel/list",
  trustLevel: "app",
  handler: async () => {
    const [categories, sousCategories, sousCategorieChamps] = await Promise.all([
      listerCategoriesActives(),
      listerSousCategoriesActives(),
      listerSousCategorieChampsActifs(),
    ]);
    return { status: 200, body: { categories, sousCategories, sousCategorieChamps } };
  },
};
