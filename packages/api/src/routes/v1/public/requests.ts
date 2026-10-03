import { randomUUID } from "node:crypto";
import type { Route } from "../../../core/types.js";
import { validerDemandePublique, HONEYPOT_DECLENCHE } from "../../../core/validationRequestPublique.js";
import { enregistrerOperations } from "../../../core/storeServeur.js";
import { verifierLimitation } from "../../../core/rateLimiter.js";
import { ApiError } from "../../../core/errors.js";

/**
 * POST /v1/public/requests — correction "Intégration Site Phase 5".
 *
 * Point d'entrée réel anticipé depuis la Phase 3.6/4.1 (voir
 * `public/health.ts` : "les vraies routes publiques... création de
 * demande — seront ajoutées en Phase 3/4"). Le site vitrine appelle
 * CETTE route directement (jamais authentifiée par un JWT
 * d'installation, qui ne doit jamais quitter le processus principal de
 * l'application).
 *
 * Flux : validation stricte -> honeypot (faux succès silencieux si
 * déclenché) -> limitation de fréquence par IP -> stockage via le MÊME
 * mécanisme technique que la synchronisation authentifiée
 * (`enregistrerOperations`, entityType "demande") — l'application
 * MAXI-EQUIP récupère ensuite cette demande via son PULL habituel, sans
 * aucune modification nécessaire côté application (déjà géré depuis la
 * Phase 4.1 : SyncService applique réellement les opérations "demande").
 *
 * Volontairement AUCUNE réponse différenciée entre "honeypot déclenché"
 * et "succès réel" — jamais un indice donné à un robot.
 */

const LIMITE_REQUETES = 5;
const FENETRE_LIMITE_MS = 10 * 60 * 1000;

export const publicSubmitRequestRoute: Route = {
  method: "POST",
  path: "/public/requests",
  trustLevel: "public",
  handler: async (req) => {
    const limitation = verifierLimitation(req.ip, LIMITE_REQUETES, FENETRE_LIMITE_MS);
    if (!limitation.autorise) {
      throw new ApiError(429, "rate_limited", `Trop de demandes envoyées récemment. Réessayez dans ${limitation.reessayerDansSecondes} secondes.`);
    }

    const resultat = validerDemandePublique(req.body);

    const requestId = randomUUID();
    const submittedAt = new Date().toISOString();

    if (resultat === HONEYPOT_DECLENCHE) {
      return { status: 200, body: { requestId, submittedAt } };
    }

    await enregistrerOperations([{ entityType: "demande", entityId: requestId, payload: resultat }]);

    return { status: 200, body: { requestId, submittedAt } };
  },
};
