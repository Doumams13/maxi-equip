import type { Route } from "../../../../core/types.js";
import { ValidationError } from "../../../../core/errors.js";
import { initialiserStockCentral } from "../../../../core/operationsStockStore.js";
import type { LigneInitialisationStock } from "../../../../core/serverStorage.js";

/**
 * POST /v1/app/operations/initialiser-stock — correction "pc annexe ne
 * peut pas vendre malgré le stock réel" (2026-10-27).
 *
 * `stock_central` part toujours de 0 et n'est alimentée QUE par des
 * opérations déjà validées en ligne — un poste qui vendait encore
 * uniquement en local avant d'activer la validation distante n'y a
 * jamais rien inscrit, donc son stock réel y est invisible pour tout
 * autre poste qui, lui, valide déjà en ligne.
 *
 * Fixe une quantité ABSOLUE (jamais un delta) pour chaque ligne reçue —
 * destinée à être envoyée UNE SEULE FOIS, depuis le poste qui détient le
 * vrai stock à jour (voir `StockRepository.listTout()` côté Electron).
 * Pas de restriction de rôle au niveau de cette route (le jeton
 * d'installation ne porte pas d'identité par utilisateur) — l'action
 * elle-même est réservée à l'Administrateur côté Electron (voir
 * `ipc/initialisationStockCentral.ts`), même principe de défense que les
 * autres actions sensibles de ce projet.
 */
function validerLignes(body: unknown): LigneInitialisationStock[] {
  const b = body as { lignes?: unknown } | undefined;
  if (!b || !Array.isArray(b.lignes) || b.lignes.length === 0) {
    throw new ValidationError("lignes (tableau non vide) est requis.");
  }
  return b.lignes.map((l, i) => {
    const o = l as { produitId?: unknown; emplacementId?: unknown; quantite?: unknown } | undefined;
    if (
      !o ||
      typeof o.produitId !== "string" ||
      o.produitId.length === 0 ||
      typeof o.emplacementId !== "string" ||
      o.emplacementId.length === 0 ||
      typeof o.quantite !== "number" ||
      !Number.isFinite(o.quantite) ||
      o.quantite < 0
    ) {
      throw new ValidationError(`lignes[${i}] invalide (produitId, emplacementId, quantite >= 0 requis).`);
    }
    return { produitId: o.produitId, emplacementId: o.emplacementId, quantite: o.quantite };
  });
}

export const initialiserStockRoute: Route = {
  method: "POST",
  path: "/app/operations/initialiser-stock",
  trustLevel: "app",
  handler: async (req) => {
    const lignes = validerLignes(req.body);
    const resultat = await initialiserStockCentral(lignes);
    return { status: 200, body: resultat };
  },
};
