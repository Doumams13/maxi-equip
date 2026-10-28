import type { Route } from "../../../../core/types.js";
import { ValidationError, NotFoundError } from "../../../../core/errors.js";
import { reautoriserPoste } from "../../../../core/posteStore.js";

/**
 * POST /v1/app/postes/reautoriser — système multiposte fiable
 * (2026-10-28). Symétrique de bloquer.ts — pose `statut = 'actif'`,
 * restaure l'accès sans jamais toucher à l'historique/aux données
 * locales du poste concerné (qui ne vivent que sur sa propre machine).
 */
export const postesReautoriserRoute: Route = {
  method: "POST",
  path: "/app/postes/reautoriser",
  trustLevel: "app",
  handler: async (req) => {
    const body = req.body as { posteId?: unknown } | undefined;
    if (!body || typeof body.posteId !== "string" || body.posteId.length === 0) {
      throw new ValidationError("posteId (chaîne non vide) est requis.");
    }

    const resultat = await reautoriserPoste(body.posteId, new Date().toISOString());
    if (!resultat.applique) throw new NotFoundError("Poste introuvable.");
    return { status: 200, body: { success: true } };
  },
};
