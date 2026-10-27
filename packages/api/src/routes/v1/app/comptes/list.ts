import type { Route } from "../../../../core/types.js";
import { listerComptesActifs } from "../../../../core/compteStore.js";

/**
 * GET /v1/app/comptes/list — correction "visibilité croisée Factures/
 * Historique entre postes" (2026-10-27), Phase 1.
 *
 * Débloque les clés étrangères locales `factures.vendeur_utilisateur_id`
 * (NOT NULL) et `mouvements.utilisateur_id`/`annule_par` pour un
 * vendeur qui ne s'est jamais connecté sur CE poste précis — jusqu'ici
 * un compte centralisé n'était mirroré localement qu'au moment où il se
 * connectait lui-même sur une machine donnée (voir
 * `AuthService.loginEnLigne` →
 * `UtilisateurRepository.upsertDepuisConnexionCentrale`), jamais de
 * façon proactive.
 *
 * Délibérément SANS hash de mot de passe dans la réponse (voir
 * `CompteCatchupRow`) — cette route ne sert qu'à peupler l'identité
 * locale affichée (nom/rôle), jamais à authentifier qui que ce soit.
 * Relecture intégrale, même principe que `/app/emplacements/list`.
 */
export const comptesListRoute: Route = {
  method: "GET",
  path: "/app/comptes/list",
  trustLevel: "app",
  handler: async () => {
    const comptes = await listerComptesActifs();
    return { status: 200, body: { comptes } };
  },
};
