import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { getPosteEventBus, reinitialiserPosteEventBusPourTests } from "./core/posteEventBus.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.8, chantier A — notification
 * SSE immédiate pour les 3 types référentiels (categorie/sous_categorie/
 * sous_categorie_champ), ajoutée dans la branche `operationsCatalogue` de
 * push.ts (jusqu'ici seule la branche `operationsHeritees`, vente/
 * mouvement, diffusait un signal). Vérifie le VRAI bus singleton
 * (`getPosteEventBus()`), exactement celui utilisé par push.ts — jamais
 * une instance de test isolée.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-push-sse";
const POSTE_ID = "poste-emetteur-test";

function tokenValide(): string {
  return signerJwt({ sub: POSTE_ID, role: "app" }, SECRET_TEST, 3600);
}

function push(operations: unknown[]) {
  return { method: "POST" as const, path: "/v1/sync/push", headers: { authorization: `Bearer ${tokenValide()}` }, body: { operations } };
}

/** Écoute le bus via une connexion factice enregistrée sous un AUTRE poste (jamais l'émetteur lui-même — cohérent avec "diffuse à TOUS les postes connectés"). */
function ecouterBus(): { evenements: { type: string }[]; arreter: () => void } {
  const evenements: { type: string }[] = [];
  const arreter = getPosteEventBus().enregistrer("poste-observateur-test", { notifier: (e) => evenements.push(e), fermer: vi.fn() });
  return { evenements, arreter };
}

describe("Phase 5 (référentiel commun), sous-phase 5.8 — notifications SSE sur push référentiel", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
    reinitialiserPosteEventBusPourTests();
    reinitialiserLimitationPourTests();
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
    reinitialiserPosteEventBusPourTests();
  });

  it("1 — une nouvelle catégorie reçue déclenche une notification 'categorie'", async () => {
    const router = createRouter();
    const { evenements, arreter } = ecouterBus();

    const res = await router.dispatch(
      req(
        push([
          { entityType: "categorie", entityId: "11111111-1111-4111-8111-111111111111", payload: { operation: "create", categorieId: "11111111-1111-4111-8111-111111111111", nom: "Électricité", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" } },
        ])
      )
    );

    expect(res.status).toBe(200);
    expect(evenements).toEqual([{ type: "categorie" }]);
    arreter();
  });

  it("2 — une nouvelle sous-catégorie reçue déclenche une notification 'sous_categorie'", async () => {
    const router = createRouter();
    const { evenements, arreter } = ecouterBus();

    await router.dispatch(
      req(
        push([
          {
            entityType: "sous_categorie",
            entityId: "22222222-2222-4222-8222-222222222222",
            payload: {
              operation: "create",
              sousCategorieId: "22222222-2222-4222-8222-222222222222",
              categorieId: "11111111-1111-4111-8111-111111111111",
              nom: "Câblage",
              ordre: 0,
              modelePhysique: null,
              unitesAutorisees: null,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        ])
      )
    );

    expect(evenements).toEqual([{ type: "sous_categorie" }]);
    arreter();
  });

  it("3 — un nouveau champ reçu déclenche une notification 'sous_categorie_champ'", async () => {
    const router = createRouter();
    const { evenements, arreter } = ecouterBus();

    await router.dispatch(
      req(
        push([
          {
            entityType: "sous_categorie_champ",
            entityId: "33333333-3333-4333-8333-333333333333",
            payload: {
              operation: "create",
              champId: "33333333-3333-4333-8333-333333333333",
              sousCategorieId: "22222222-2222-4222-8222-222222222222",
              nom: "Diamètre",
              type: "nombre",
              obligatoire: false,
              valeursAutorisees: null,
              uniteMesure: "mm",
              role: "physique",
              ordre: 0,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        ])
      )
    );

    expect(evenements).toEqual([{ type: "sous_categorie_champ" }]);
    arreter();
  });

  it("4 — une opération déjà traitée et PÉRIMÉE (updatedAt strictement plus ancien que l'état déjà stocké, rejetée par la condition LWW — même principe que le reste du projet, voir 'opération plus ancienne reçue après une plus récente n'écrase jamais l'état') ne déclenche AUCUNE nouvelle notification", async () => {
    const router = createRouter();
    const categorieId = "11111111-1111-4111-8111-111111111111";
    // Établit d'abord un état RÉCENT (updatedAt le plus tardif).
    await router.dispatch(
      req(
        push([
          { entityType: "categorie", entityId: categorieId, payload: { operation: "create", categorieId, nom: "Électricité", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-02T00:00:00.000Z" } },
        ])
      )
    );

    const { evenements, arreter } = ecouterBus();
    // Rejoue une version PÉRIMÉE (updatedAt plus ancien) — la condition LWW (`WHERE excluded.updated_at >= ...`) rejette l'écriture (applique: false) : jamais une notification pour cette resynchronisation sans effet réel.
    const res = await router.dispatch(
      req(
        push([
          { entityType: "categorie", entityId: categorieId, payload: { operation: "update", categorieId, nom: "PÉRIMÉ", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" } },
        ])
      )
    );

    expect(res.status).toBe(200);
    expect(evenements).toEqual([]);
    arreter();
  });

  it("5 — les autres types de projection (modèle, produit, compte, emplacement, promotion) conservent leur comportement actuel : AUCUNE notification SSE", async () => {
    const router = createRouter();
    const { evenements, arreter } = ecouterBus();

    await router.dispatch(
      req(
        push([
          { entityType: "modele", entityId: "44444444-4444-4444-8444-444444444444", payload: { operation: "create", modeleId: "44444444-4444-4444-8444-444444444444", motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } },
          { entityType: "compte", entityId: "55555555-5555-4555-8555-555555555555", payload: { operation: "create", compteId: "55555555-5555-4555-8555-555555555555", identifiant: "test.sse", hashMotDePasse: "$argon2id$hash-quelconque", nom: "Test", role: "gerant", actif: true, updatedAt: "2026-01-01T00:00:00.000Z" } },
          { entityType: "emplacement", entityId: "66666666-6666-4666-8666-666666666666", payload: { operation: "create", emplacementId: "66666666-6666-4666-8666-666666666666", nom: "Dépôt", type: "entrepot", ville: null, estPointDeVente: false, actif: true, updatedAt: "2026-01-01T00:00:00.000Z" } },
        ])
      )
    );

    expect(evenements).toEqual([]);
    arreter();
  });

  it("6 — le chemin historique vente/mouvement reste inchangé : notifie toujours normalement, indépendamment de l'ajout référentiel", async () => {
    const router = createRouter();
    const { evenements, arreter } = ecouterBus();

    const res = await router.dispatch(
      req(
        push([
          { entityType: "vente", entityId: "77777777-7777-4777-8777-777777777777", payload: { total: 5000 } },
        ])
      )
    );

    expect(res.status).toBe(200);
    expect(evenements).toEqual([{ type: "vente" }]);
    arreter();
  });
});
