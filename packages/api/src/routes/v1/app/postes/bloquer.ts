import type { Route } from "../../../../core/types.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../../../../core/errors.js";
import { getPoste, bloquerPoste } from "../../../../core/posteStore.js";
import { getPosteEventBus } from "../../../../core/posteEventBus.js";

/**
 * POST /v1/app/postes/bloquer — système multiposte fiable (2026-10-28).
 *
 * Pose `statut = 'bloque'` en base — l'application réelle du blocage
 * (refus 403 par `authentifier()`/`autorisationPoste.ts`, fermeture de
 * session côté client) est déjà en place depuis la Phase D.
 *
 * Système multiposte fiable, Phase F : ferme en plus ACTIVEMENT toute
 * connexion de flux SSE ouverte pour ce poste (voir posteEventBus.ts)
 * — sans ça, un poste bloqué resterait connecté à son flux jusqu'à sa
 * prochaine reconnexion, recevant les signaux de synchronisation sans
 * jamais pouvoir réellement synchroniser (ses requêtes PUSH/PULL
 * seraient déjà refusées, mais la connexion de flux elle-même resterait
 * ouverte inutilement).
 *
 * Garde-fou : jamais le poste "shop" lui-même — le bloquer couperait
 * l'accès au SEUL poste capable de ré-autoriser qui que ce soit,
 * verrouillant l'installation entière sans recours.
 */
export const postesBloquerRoute: Route = {
  method: "POST",
  path: "/app/postes/bloquer",
  trustLevel: "app",
  handler: async (req) => {
    const body = req.body as { posteId?: unknown } | undefined;
    if (!body || typeof body.posteId !== "string" || body.posteId.length === 0) {
      throw new ValidationError("posteId (chaîne non vide) est requis.");
    }

    const poste = await getPoste(body.posteId);
    if (!poste) throw new NotFoundError("Poste introuvable.");
    if (poste.role === "shop") {
      throw new ForbiddenError("Le poste Shop ne peut pas être bloqué — il doit rester disponible pour administrer l'installation.");
    }

    await bloquerPoste(body.posteId, new Date().toISOString());
    getPosteEventBus().fermerPoste(body.posteId);
    return { status: 200, body: { success: true } };
  },
};
