import type { Route } from "../../../../core/types.js";
import { validerCurseurPull } from "../../../../core/validationSync.js";
import { listerOperationsDepuis } from "../../../../core/storeServeur.js";

/**
 * GET /v1/sync/pull?since=<curseur> — Phase 3.6, Partie 9/10.
 *
 * CURSEUR CHOISI : le `curseur` auto-incrémenté de la table serveur
 * (simple entier monotone), jamais une date (les horloges de plusieurs
 * appareils peuvent diverger) ni un système de version complexe —
 * solution minimale et évolutive demandée par la Partie 10.
 *
 * AUCUNE résolution de conflit : ce PULL renvoie simplement les
 * opérations déjà enregistrées après le curseur donné, dans l'ordre —
 * jamais de fusion, jamais de détection de conflit (Partie 11,
 * explicitement hors périmètre de cette étape).
 */
export const pullRoute: Route = {
  method: "GET",
  path: "/sync/pull",
  trustLevel: "app",
  handler: async (req) => {
    const curseurDepart = validerCurseurPull(req.query["since"]);
    const { operations, hasMore } = await listerOperationsDepuis(curseurDepart);
    const nouveauCurseur = operations.length > 0 ? operations[operations.length - 1]!.curseur : curseurDepart;
    return { status: 200, body: { operations, cursor: nouveauCurseur, hasMore } };
  },
};
