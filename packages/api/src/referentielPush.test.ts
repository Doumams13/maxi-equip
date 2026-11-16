import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur, listerOperationsDepuis } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.3 — test de bout en bout
 * (vrai routeur) du pipeline complet : POST /v1/sync/push (3 nouvelles
 * entités) → GET /v1/app/referentiel/list (sous-phase 5.2, déjà livrée).
 * Même patron exact que `catalogSync.test.ts`/`catalogueCatchup.test.ts`.
 *
 * Couvre aussi explicitement la non-régression du chemin hérité
 * (vente/mouvement) et des types déjà projetés (modèle/produit/compte/
 * emplacement), demandée par le lot.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-referentiel-push";
const CATEGORIE_1 = "11111111-1111-4111-8111-111111111111";
const SOUS_CATEGORIE_1 = "22222222-2222-4222-8222-222222222222";
const CHAMP_1 = "33333333-3333-4333-8333-333333333333";
const VENTE_1 = "44444444-4444-4444-8444-444444444444";
const MODELE_1 = "55555555-5555-4555-8555-555555555555";
const COMPTE_1 = "66666666-6666-4666-8666-666666666666";
const EMPLACEMENT_1 = "77777777-7777-4777-8777-777777777777";

function token(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function push(operations: unknown[]) {
  return { method: "POST" as const, path: "/v1/sync/push", headers: { authorization: `Bearer ${token()}` }, body: { operations } };
}

function listerReferentiel() {
  return { method: "GET" as const, path: "/v1/app/referentiel/list", headers: { authorization: `Bearer ${token()}` } };
}

describe("Push + catch-up du référentiel commun — bout en bout (Phase 5, sous-phase 5.3)", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
    // Phase 5 (référentiel commun), sous-phase 5.8, chantier E — voir le commentaire équivalent dans catalogSync.test.ts.
    reinitialiserLimitationPourTests();
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
  });

  it("les 3 nouvelles entités poussées via /sync/push sont matérialisées et retrouvées via /app/referentiel/list, avec la configuration d'unités en sous-objet", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          {
            entityType: "categorie",
            entityId: CATEGORIE_1,
            payload: { operation: "create", categorieId: CATEGORIE_1, nom: "Quincaillerie générale", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
          {
            entityType: "sous_categorie",
            entityId: SOUS_CATEGORIE_1,
            payload: {
              operation: "create",
              sousCategorieId: SOUS_CATEGORIE_1,
              categorieId: CATEGORIE_1,
              nom: "Ciments et liants",
              ordre: 0,
              modelePhysique: null,
              unitesAutorisees: ["sac", "kg"],
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          {
            entityType: "sous_categorie_champ",
            entityId: CHAMP_1,
            payload: {
              operation: "create",
              champId: CHAMP_1,
              sousCategorieId: SOUS_CATEGORIE_1,
              nom: "Poids",
              type: "nombre",
              obligatoire: true,
              valeursAutorisees: null,
              uniteMesure: "kg",
              role: "physique",
              ordre: 0,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        ])
      )
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      results: [
        { entityId: CATEGORIE_1, statut: "cree" },
        { entityId: SOUS_CATEGORIE_1, statut: "cree" },
        { entityId: CHAMP_1, statut: "cree" },
      ],
    });

    const lecture = await router.dispatch(req(listerReferentiel()));
    expect(lecture.status).toBe(200);
    const body = lecture.body as {
      categories: { id: string; nom: string }[];
      sousCategories: { id: string; unitesAutorisees: string[] | null }[];
      sousCategorieChamps: { id: string; nom: string }[];
    };
    expect(body.categories).toEqual(expect.arrayContaining([expect.objectContaining({ id: CATEGORIE_1, nom: "Quincaillerie générale" })]));
    // Stocké tel quel côté serveur (jamais retrié) — l'ordre alphabétique
    // n'est qu'un comportement du repository LOCAL (SousCategorieUniteRepository),
    // jamais appliqué à cette projection serveur.
    expect(body.sousCategories).toEqual(expect.arrayContaining([expect.objectContaining({ id: SOUS_CATEGORIE_1, unitesAutorisees: ["sac", "kg"] })]));
    expect(body.sousCategorieChamps).toEqual(expect.arrayContaining([expect.objectContaining({ id: CHAMP_1, nom: "Poids" })]));
  });

  it("rejette un payload 'categorie' invalide (nom manquant), jamais une projection partielle du lot", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          { entityType: "categorie", entityId: CATEGORIE_1, payload: { operation: "create", categorieId: CATEGORIE_1, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" } },
        ])
      )
    );
    expect(res.status).not.toBe(200);
    const lecture = await router.dispatch(req(listerReferentiel()));
    const body = lecture.body as { categories: unknown[] };
    expect(body.categories).toEqual([]);
  });

  it("NON-RÉGRESSION — un lot mixte (vente + référentiel) applique la vente strictement comme avant : enregistrée dans le journal immuable, idempotente, jamais touchée par le routage référentiel", async () => {
    const router = createRouter();
    const resultat = await router.dispatch(
      req(
        push([
          { entityType: "vente", entityId: VENTE_1, payload: { numero: "FAC-2026-0001", total: 54000 } },
          {
            entityType: "categorie",
            entityId: CATEGORIE_1,
            payload: { operation: "create", categorieId: CATEGORIE_1, nom: "Quincaillerie", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
        ])
      )
    );
    expect(resultat.body).toMatchObject({ results: [{ entityId: VENTE_1, statut: "cree" }, { entityId: CATEGORIE_1, statut: "cree" }] });

    // La vente a bien rejoint le journal immuable (jamais la projection référentiel).
    const { operations } = await listerOperationsDepuis(0);
    const venteJournalisee = operations.find((o) => o.entityId === VENTE_1);
    expect(venteJournalisee).toMatchObject({ entityType: "vente", payload: { numero: "FAC-2026-0001", total: 54000 } });

    // Rejouer EXACTEMENT le même lot : la vente reste idempotente ("deja_traite"), la catégorie (projection LWW) reste "cree" (upsert, jamais une erreur de doublon).
    const rejoue = await router.dispatch(
      req(
        push([
          { entityType: "vente", entityId: VENTE_1, payload: { numero: "FAC-2026-0001", total: 54000 } },
          {
            entityType: "categorie",
            entityId: CATEGORIE_1,
            payload: { operation: "create", categorieId: CATEGORIE_1, nom: "Quincaillerie", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
        ])
      )
    );
    // La catégorie est une projection LWW (upsert conditionné par
    // updatedAt) : la rejouer avec le MÊME updatedAt réapplique
    // l'upsert (comportement attendu, "cree" du point de vue du client
    // — voir le commentaire de push.ts) ; seule la vente, journal
    // immuable, doit basculer en "deja_traite".
    expect((rejoue.body as { results: { entityId: string; statut: string }[] }).results).toEqual(
      expect.arrayContaining([{ entityId: VENTE_1, statut: "deja_traite" }])
    );
  });

  it("NON-RÉGRESSION — modèle/produit/compte/emplacement déjà existants continuent de fonctionner exactement comme avant, dans le même lot que le référentiel", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          { entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } },
          {
            entityType: "compte",
            entityId: COMPTE_1,
            payload: { operation: "create", compteId: COMPTE_1, identifiant: "jdupont", hashMotDePasse: "hash", nom: "Jean Dupont", role: "gerant", actif: true, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
          {
            entityType: "emplacement",
            entityId: EMPLACEMENT_1,
            payload: { operation: "create", emplacementId: EMPLACEMENT_1, nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false, actif: true, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
          {
            entityType: "categorie",
            entityId: CATEGORIE_1,
            payload: { operation: "create", categorieId: CATEGORIE_1, nom: "Quincaillerie", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
        ])
      )
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      results: [
        { entityId: MODELE_1, statut: "cree" },
        { entityId: COMPTE_1, statut: "cree" },
        { entityId: EMPLACEMENT_1, statut: "cree" },
        { entityId: CATEGORIE_1, statut: "cree" },
      ],
    });
  });

  it("rétrocompatibilité : un payload 'modele' ancien format (sans sousCategorieId/marque) reste accepté dans le même lot que le référentiel", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          { entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Modèle legacy", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } },
        ])
      )
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ results: [{ entityId: MODELE_1, statut: "cree" }] });
  });
});
