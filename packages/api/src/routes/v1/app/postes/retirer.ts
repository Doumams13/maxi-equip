import type { Route } from "../../../../core/types.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../../../../core/errors.js";
import { getPoste, retirerPoste } from "../../../../core/posteStore.js";

/**
 * POST /v1/app/postes/retirer — système multiposte fiable (2026-10-28).
 *
 * Retrait MANUEL uniquement (décision explicite, jamais d'expiration
 * automatique) — libère la place qu'occupait ce poste parmi les 5 PCX
 * maximum (voir creerPosteAnnexeSiLimiteNonAtteinte, qui compte TOUTE
 * ligne `role = 'pcx'`, bloquée ou non). Couvre notamment le cas d'une
 * restauration abandonnée/échouée : une place a déjà été consommée à
 * l'étape `verifier-recuperation`, mais le poste n'a jamais fini de
 * s'enregistrer (`nom` resté `null`) — visible et supprimable ici.
 *
 * Suppression PHYSIQUE de la ligne (jamais un statut supplémentaire) :
 * `postes` ne porte aucune donnée commerciale, contrairement aux
 * dépôts/comptes/factures — rien à préserver pour une ligne retirée.
 * Jamais le poste "shop" (même garde-fou que bloquer.ts).
 */
export const postesRetirerRoute: Route = {
  method: "POST",
  path: "/app/postes/retirer",
  trustLevel: "app",
  handler: async (req) => {
    const body = req.body as { posteId?: unknown } | undefined;
    if (!body || typeof body.posteId !== "string" || body.posteId.length === 0) {
      throw new ValidationError("posteId (chaîne non vide) est requis.");
    }

    const poste = await getPoste(body.posteId);
    if (!poste) throw new NotFoundError("Poste introuvable.");
    if (poste.role === "shop") {
      throw new ForbiddenError("Le poste Shop ne peut pas être retiré.");
    }

    await retirerPoste(body.posteId);
    return { status: 200, body: { success: true } };
  },
};
