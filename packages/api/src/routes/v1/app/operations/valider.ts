import type { Route } from "../../../../core/types.js";
import { ValidationError } from "../../../../core/errors.js";
import { validerEtAppliquerOperationStock } from "../../../../core/operationsStockStore.js";
import type { DemandeValidationStock } from "../../../../core/serverStorage.js";

/**
 * POST /v1/app/operations/valider — correction "travailler en parallèle
 * sur le même stock" (2026-10-22). Appelée par venteService.ts et les
 * services de mouvement de stock côté Electron AVANT de finaliser
 * localement une vente/entrée/sortie/transfert, dès que la
 * synchronisation est configurée sur ce poste — jamais une opération qui
 * se base sur le stock local dans ce cas (décision utilisateur
 * explicite). Toute la logique réelle (verrou de ligne, vérification,
 * attribution du numéro de facture) vit dans
 * `ServerStorage.validerEtAppliquerOperationStock` — cette route ne fait
 * que valider la forme de la requête et transmettre.
 *
 * Réponse 200 dans les deux cas (succès ou stock insuffisant) : un stock
 * insuffisant est un résultat métier normal et attendu, jamais une erreur
 * HTTP — c'est à l'appelant (venteService.ts) de décider comment réagir
 * (bloquer la vente, afficher le détail du manque).
 */
function validerDemande(body: unknown): DemandeValidationStock {
  const b = body as { deltas?: unknown; demandeNumeroFacture?: unknown } | undefined;
  if (!b || !Array.isArray(b.deltas) || b.deltas.length === 0) {
    throw new ValidationError("deltas (tableau non vide) est requis.");
  }
  const deltas = b.deltas.map((d, i) => {
    const o = d as { produitId?: unknown; emplacementId?: unknown; delta?: unknown } | undefined;
    if (!o || typeof o.produitId !== "string" || o.produitId.length === 0 || typeof o.emplacementId !== "string" || o.emplacementId.length === 0 || typeof o.delta !== "number" || !Number.isFinite(o.delta) || o.delta === 0) {
      throw new ValidationError(`deltas[${i}] invalide (produitId, emplacementId, delta non nul requis).`);
    }
    return { produitId: o.produitId, emplacementId: o.emplacementId, delta: o.delta };
  });

  let demandeNumeroFacture: DemandeValidationStock["demandeNumeroFacture"];
  if (b.demandeNumeroFacture !== undefined) {
    const n = b.demandeNumeroFacture as { prefix?: unknown } | undefined;
    if (!n || typeof n.prefix !== "string" || n.prefix.length === 0) {
      throw new ValidationError("demandeNumeroFacture.prefix (chaîne non vide) est requis s'il est fourni.");
    }
    demandeNumeroFacture = { prefix: n.prefix };
  }

  return { deltas, demandeNumeroFacture };
}

export const validerOperationStockRoute: Route = {
  method: "POST",
  path: "/app/operations/valider",
  trustLevel: "app",
  handler: async (req) => {
    const demande = validerDemande(req.body);
    const resultat = await validerEtAppliquerOperationStock(demande);
    return { status: 200, body: resultat };
  },
};
