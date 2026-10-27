import type { Route } from "../../../../core/types.js";
import { listerModelesActifs, listerProduitsActifs } from "../../../../core/catalogStore.js";

/**
 * GET /v1/app/catalogue/list — correction "visibilité croisée Factures/
 * Historique entre postes" (2026-10-27), Phase 2.
 *
 * Jusqu'ici le catalogue (modèle/produit) n'était poussé que VERS le
 * serveur, pour alimenter la projection publique du site vitrine (voir
 * `catalogStore.ts`) — jamais relu par un poste Electron. Débloque la
 * clé étrangère locale `mouvements.produit_id` (NOT NULL) pour un
 * produit créé sur un autre poste : une entrée/sortie/transfert reçu
 * d'un autre poste ne peut pas s'appliquer sans que le produit existe
 * déjà localement. Les ventes n'en ont PAS besoin
 * (`lignes_facture.produit_id` est nullable, la ligne est dénormalisée
 * — motif/taille/prix stockés directement).
 *
 * Une seule requête, modèles ET produits ensemble (plutôt que deux
 * routes séparées) — toujours appliqués dans cet ordre côté client
 * (les produits dénormalisent motif/type depuis leur modèle local, voir
 * `ProduitRepository.creerDepuisServeur`), donc autant les transmettre
 * en un seul aller-retour réseau. Relecture intégrale, même principe
 * que `/app/emplacements/list`/`/app/comptes/list`.
 */
export const catalogueListRoute: Route = {
  method: "GET",
  path: "/app/catalogue/list",
  trustLevel: "app",
  handler: async () => {
    const [modeles, produits] = await Promise.all([listerModelesActifs(), listerProduitsActifs()]);
    return { status: 200, body: { modeles, produits } };
  },
};
