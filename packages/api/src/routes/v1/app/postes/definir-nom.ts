import type { Route } from "../../../../core/types.js";
import { ValidationError, NotFoundError } from "../../../../core/errors.js";
import { definirNomPoste } from "../../../../core/posteStore.js";

const NOM_MAX_LONGUEUR = 60;

/**
 * POST /v1/app/postes/definir-nom — système multiposte fiable
 * (2026-10-28). Choisit/modifie le nom affiché d'UN poste : toujours
 * celui du jeton de l'appelant (jamais un `posteId` dans le corps —
 * un poste ne peut renommer que lui-même), conformément à l'exigence
 * "renommer un poste ne doit jamais changer son identité technique" :
 * seul `nom` change ici, `id`/`role` restent immuables.
 *
 * 404 si le jeton de l'appelant ne correspond à aucun poste enregistré
 * (ex. un jeton antérieur à cette correction, voir postes/moi.ts).
 */
export const postesDefinirNomRoute: Route = {
  method: "POST",
  path: "/app/postes/definir-nom",
  trustLevel: "app",
  handler: async (req) => {
    const body = req.body as { nom?: unknown } | undefined;
    if (!body || typeof body.nom !== "string" || body.nom.trim().length === 0) {
      throw new ValidationError("nom (chaîne non vide) est requis.");
    }
    const nom = body.nom.trim().slice(0, NOM_MAX_LONGUEUR);

    const resultat = await definirNomPoste(req.auth!.sub, nom, new Date().toISOString());
    if (!resultat.applique) {
      throw new NotFoundError("Ce jeton ne correspond à aucun poste enregistré.");
    }
    return { status: 200, body: { success: true, nom } };
  },
};
