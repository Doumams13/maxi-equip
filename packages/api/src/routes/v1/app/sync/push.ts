import type { Route } from "../../../../core/types.js";
import { validerRequetePush } from "../../../../core/validationSync.js";
import { enregistrerOperations, type OperationRecue, type ResultatEnregistrement } from "../../../../core/storeServeur.js";
import { validerOperationModele, validerOperationProduit, validerOperationPromotion, validerOperationIdentite } from "../../../../core/validationCatalogueSync.js";
import { appliquerOperationModele, appliquerOperationProduit, appliquerOperationPromotion } from "../../../../core/catalogStore.js";
import { appliquerOperationIdentite } from "../../../../core/identiteStore.js";

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
 *
 * Correction "Intégration Site Phase 5, Partie 2 (pipeline catalogue)" :
 * les opérations "modele"/"produit"/"promotion" ne rejoignent JAMAIS le
 * journal `operations_synchronisees` (sa contrainte UNIQUE(entity_type,
 * entity_id) est conçue pour des événements immuables — vente,
 * mouvement — jamais pour une entité mutable poussée plusieurs fois au
 * fil de ses modifications, ce qui bloquerait silencieusement toute mise
 * à jour ultérieure de la même entité). Elles sont matérialisées
 * directement dans la projection catalogue (core/catalogStore.ts), avec
 * leur propre garantie d'idempotence/ordre basée sur `updatedAt`. Le
 * comportement des autres types (vente/annulation/entree/sortie/
 * transfert/demande) reste STRICTEMENT inchangé — même fonction
 * `enregistrerOperations`, même ordre de traitement.
 *
 * Correction "L'appli gère les infos du site" — bug réel identifié :
 * "parametres_entreprise" restait dans le lot hérité malgré EXACTEMENT
 * le même défaut que modele/produit/promotion avant leur correction
 * (singleton mutable, poussé plusieurs fois au fil de ses
 * modifications) — la contrainte UNIQUE du journal bloquait
 * silencieusement toute modification après la toute première. Déplacé
 * ici vers le même mécanisme de projection ("upsert si plus récent"),
 * jamais une seconde logique inventée pour l'occasion.
 */

const TYPES_CATALOGUE = new Set(["modele", "produit", "promotion"]);
const TYPES_PROJECTION = new Set([...TYPES_CATALOGUE, "parametres_entreprise"]);

export const pushRoute: Route = {
  method: "POST",
  path: "/sync/push",
  trustLevel: "app",
  handler: async (req) => {
    const operations = validerRequetePush(req.body);

    // Deux passes délibérées : TOUT valider d'abord (aucun effet de bord),
    // puis TOUT appliquer — pour que, comme pour le lot hérité (transaction
    // unique dans enregistrerOperations), une opération catalogue invalide
    // en fin de lot n'applique jamais partiellement les opérations valides
    // qui la précèdent dans la même requête.
    const operationsCatalogue: { index: number; entityType: string; payload: unknown }[] = [];
    const operationsHeritees: { index: number; op: OperationRecue }[] = [];

    operations.forEach((op, index) => {
      if (!TYPES_PROJECTION.has(op.entityType)) {
        operationsHeritees.push({ index, op });
        return;
      }
      const payload =
        op.entityType === "modele"
          ? validerOperationModele(op.payload)
          : op.entityType === "produit"
            ? validerOperationProduit(op.payload)
            : op.entityType === "promotion"
              ? validerOperationPromotion(op.payload)
              : validerOperationIdentite(op.payload);
      operationsCatalogue.push({ index, entityType: op.entityType, payload });
    });

    const resultats: (ResultatEnregistrement | null)[] = new Array(operations.length).fill(null);

    // Séquentiel (jamais Promise.all) — préserve l'ordre logique
    // d'application déjà garanti pour le lot hérité (Partie K de l'audit
    // pré-production : "respecter leur ordre logique et leur idempotence").
    for (const { index, entityType, payload } of operationsCatalogue) {
      if (entityType === "modele") await appliquerOperationModele(payload as never);
      else if (entityType === "produit") await appliquerOperationProduit(payload as never);
      else if (entityType === "promotion") await appliquerOperationPromotion(payload as never);
      else await appliquerOperationIdentite(payload as never);
      // Idempotent par construction (upsert conditionné par updatedAt) —
      // toujours "cree" du point de vue du client, qui n'a besoin que de
      // savoir que l'opération a été acceptée pour marquer son envoi
      // local comme confirmé (voir SyncService.effectuerPush côté app).
      resultats[index] = { entityId: operations[index]!.entityId, statut: "cree" };
    }

    if (operationsHeritees.length > 0) {
      const resultatsHerites = await enregistrerOperations(operationsHeritees.map((e) => e.op));
      operationsHeritees.forEach((entree, i) => {
        resultats[entree.index] = resultatsHerites[i]!;
      });
    }

    return { status: 200, body: { results: resultats as ResultatEnregistrement[] } };
  },
};
