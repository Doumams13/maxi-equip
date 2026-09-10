import type { Route } from "../../../../core/types.js";
import { validerRequetePush } from "../../../../core/validationSync.js";
import { enregistrerOperations } from "../../../../core/storeServeur.js";

/**
 * POST /v1/sync/push — Phase 3.6, Partie 3.
 *
 * Flux exact demandé : JWT → middleware auth (déjà appliqué par le
 * routeur avant d'atteindre ce gestionnaire, jamais recopié ici) →
 * validation → service de stockage → réponse.
 *
 * Réponse toujours 200 avec le détail PAR OPÉRATION du lot (créée ou
 * déjà traitée) — jamais une erreur pour un doublon, qui est un cas
 * normal et attendu de la synchronisation (Partie 8 : "opération déjà
 * traitée → réponse explicite mais sans duplication", jamais un code
 * d'erreur pour ce cas précis).
 */
export const pushRoute: Route = {
  method: "POST",
  path: "/sync/push",
  trustLevel: "app",
  handler: (req) => {
    const operations = validerRequetePush(req.body);
    const resultats = enregistrerOperations(operations);
    return { status: 200, body: { results: resultats } };
  },
};
