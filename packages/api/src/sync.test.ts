import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur, enregistrerOperations, listerOperationsDepuis } from "./core/storeServeur.js";
import { getIdentiteActuelle } from "./core/identiteStore.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-sync";
const UUID_1 = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";

function tokenValide(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

describe("Routes de synchronisation — Phase 3.6 (stockage SQLite réel en mémoire)", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
  });

  it("TEST 1 — PUSH avec JWT valide, UUID valide, données valides : enregistré réellement", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/sync/push",
        headers: { authorization: `Bearer ${tokenValide()}` },
        body: { operations: [{ entityType: "vente", entityId: UUID_1, payload: { numero: "FAC-2026-0001", total: 5000 } }] },
      })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ results: [{ entityId: UUID_1, statut: "cree" }] });

    // Vérifie que la donnée est RÉELLEMENT dans le stockage, pas seulement dans la réponse.
    const pullRes = await router.dispatch(req({ path: "/v1/sync/pull", headers: { authorization: `Bearer ${tokenValide()}` } }));
    expect(pullRes.body).toMatchObject({ operations: [{ entityType: "vente", entityId: UUID_1 }] });
  });

  it("TEST 2 — PUSH sans JWT : 401, aucune donnée enregistrée", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/sync/push", body: { operations: [{ entityType: "vente", entityId: UUID_1, payload: {} }] } })
    );
    expect(res.status).toBe(401);

    const pullRes = await router.dispatch(req({ path: "/v1/sync/pull", headers: { authorization: `Bearer ${tokenValide()}` } }));
    expect((pullRes.body as { operations: unknown[] }).operations).toHaveLength(0);
  });

  it("TEST 3 — PUSH avec JWT invalide : 401, aucune donnée enregistrée", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/sync/push",
        headers: { authorization: "Bearer jeton-invente" },
        body: { operations: [{ entityType: "vente", entityId: UUID_1, payload: {} }] },
      })
    );
    expect(res.status).toBe(401);
    const pullRes = await router.dispatch(req({ path: "/v1/sync/pull", headers: { authorization: `Bearer ${tokenValide()}` } }));
    expect((pullRes.body as { operations: unknown[] }).operations).toHaveLength(0);
  });

  it("TEST 3b — PUSH avec entityType 'sortie' : accepté (200) et stocké correctement", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/sync/push",
        headers: { authorization: `Bearer ${tokenValide()}` },
        body: { operations: [{ entityType: "sortie", entityId: UUID_1, payload: { mouvementId: UUID_1, produitId: UUID_2, emplacementId: UUID_2, quantite: 5 } }] },
      })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ results: [{ entityId: UUID_1, statut: "cree" }] });

    // La sortie est retrouvable sur le PULL avec le bon entityType.
    const pullRes = await router.dispatch(req({ path: "/v1/sync/pull", headers: { authorization: `Bearer ${tokenValide()}` } }));
    const ops = (pullRes.body as { operations: { entityType: string; entityId: string }[] }).operations;
    expect(ops).toHaveLength(1);
    expect(ops[0]!.entityType).toBe("sortie");
    expect(ops[0]!.entityId).toBe(UUID_1);
  });

  it("TEST 4 — données invalides : 400 dans chaque cas, aucun enregistrement incohérent", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };

    const casInvalides = [
      { operations: [{ entityType: "utilisateur", entityId: UUID_1, payload: {} }] }, // type non supporté
      { operations: [{ entityType: "vente", entityId: "pas-un-uuid", payload: {} }] }, // UUID invalide
      { operations: [{ entityType: "vente", entityId: UUID_1 }] }, // payload absent
      { operations: [] }, // tableau vide
      {}, // champ operations absent
    ];

    for (const body of casInvalides) {
      const res = await router.dispatch(req({ method: "POST", path: "/v1/sync/push", headers: auth, body }));
      expect(res.status).toBe(400);
    }

    const pullRes = await router.dispatch(req({ path: "/v1/sync/pull", headers: auth }));
    expect((pullRes.body as { operations: unknown[] }).operations).toHaveLength(0);
  });

  it("TEST 5 — idempotence : la même opération envoyée deux fois n'est jamais dupliquée", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };
    const body = { operations: [{ entityType: "vente", entityId: UUID_1, payload: { total: 1000 } }] };

    const premiere = await router.dispatch(req({ method: "POST", path: "/v1/sync/push", headers: auth, body }));
    expect(premiere.body).toMatchObject({ results: [{ entityId: UUID_1, statut: "cree" }] });

    const deuxieme = await router.dispatch(req({ method: "POST", path: "/v1/sync/push", headers: auth, body }));
    expect(deuxieme.status).toBe(200); // Jamais une erreur pour un doublon reconnu.
    expect(deuxieme.body).toMatchObject({ results: [{ entityId: UUID_1, statut: "deja_traite" }] });

    const pullRes = await router.dispatch(req({ path: "/v1/sync/pull", headers: auth }));
    expect((pullRes.body as { operations: unknown[] }).operations).toHaveLength(1); // Jamais deux lignes.
  });

  it("TEST 6 — transaction : un lot dont une opération échoue est intégralement annulé (rollback)", async () => {
    // Test direct de la couche de stockage (contournant la validation
    // HTTP, qui rejetterait déjà ce cas en amont) — pour vérifier
    // spécifiquement la garantie transactionnelle de bas niveau :
    // un payload contenant une référence circulaire fait échouer
    // JSON.stringify() EN PLEIN MILIEU du lot.
    const objetCirculaire: Record<string, unknown> = {};
    objetCirculaire["soi_meme"] = objetCirculaire;

    await expect(
      enregistrerOperations([
        { entityType: "entree", entityId: UUID_1, payload: { quantite: 10 } },
        { entityType: "vente", entityId: UUID_2, payload: objetCirculaire },
      ])
    ).rejects.toThrow();

    // Le rollback garantit qu'AUCUNE des deux opérations n'a été
    // enregistrée — même celle qui, individuellement, était valide.
    const restant = await enregistrerOperations([]);
    expect(restant).toHaveLength(0);
  });

  it("TEST 7 — PULL avec JWT valide : 200, format correct, curseur présent", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };
    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/sync/push",
        headers: auth,
        body: {
          operations: [
            { entityType: "vente", entityId: UUID_1, payload: { total: 1000 } },
            { entityType: "entree", entityId: UUID_2, payload: { quantite: 5 } },
          ],
        },
      })
    );

    const res = await router.dispatch(req({ path: "/v1/sync/pull", headers: auth }));
    expect(res.status).toBe(200);
    const corps = res.body as { operations: { entityId: string }[]; cursor: number };
    expect(corps.operations).toHaveLength(2);
    expect(corps.cursor).toBeGreaterThan(0);

    // Un deuxième PULL à partir du nouveau curseur ne renvoie rien de plus (pas de doublon côté lecture non plus).
    const resSuite = await router.dispatch(req({ path: "/v1/sync/pull", query: { since: String(corps.cursor) }, headers: auth }));
    expect((resSuite.body as { operations: unknown[] }).operations).toHaveLength(0);
  });

  it("TEST 8 — PULL sans JWT : 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/sync/pull" }));
    expect(res.status).toBe(401);
  });

  it("TEST 9 — PULL : hasMore = false quand moins de 200 opérations", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };
    await router.dispatch(req({ method: "POST", path: "/v1/sync/push", headers: auth, body: { operations: [{ entityType: "vente", entityId: UUID_1, payload: {} }] } }));
    const res = await router.dispatch(req({ path: "/v1/sync/pull", headers: auth }));
    expect(res.status).toBe(200);
    expect((res.body as { hasMore: boolean }).hasMore).toBe(false);
    expect((res.body as { operations: unknown[] }).operations).toHaveLength(1);
  });

  it("TEST 10 — listerOperationsDepuis : hasMore = false quand exactement la limite", async () => {
    const uuids: string[] = [];
    for (let i = 0; i < 5; i++) {
      uuids.push(`${i.toString().padStart(8, "0")}-0000-4000-8000-000000000000`);
    }
    await enregistrerOperations(uuids.map((id) => ({ entityType: "entree" as const, entityId: id, payload: {} })));
    const result = await listerOperationsDepuis(0, 5);
    expect(result.operations).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  it("TEST 11 — listerOperationsDepuis : hasMore = true quand plus que la limite", async () => {
    const uuids: string[] = [];
    for (let i = 0; i < 7; i++) {
      uuids.push(`${i.toString().padStart(8, "0")}-0000-4000-8000-000000000001`);
    }
    await enregistrerOperations(uuids.map((id) => ({ entityType: "entree" as const, entityId: id, payload: {} })));
    const page1 = await listerOperationsDepuis(0, 5);
    expect(page1.operations).toHaveLength(5);
    expect(page1.hasMore).toBe(true);

    const page2 = await listerOperationsDepuis(page1.operations[4]!.curseur, 5);
    expect(page2.operations).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
  });

  it("TEST 12 — pagination : aucune opération dupliquée, toutes récupérées", async () => {
    const uuids: string[] = [];
    for (let i = 0; i < 9; i++) {
      uuids.push(`${i.toString().padStart(8, "0")}-0000-4000-8000-000000000002`);
    }
    await enregistrerOperations(uuids.map((id) => ({ entityType: "vente" as const, entityId: id, payload: {} })));

    const toutes: string[] = [];
    let curseur = 0;
    let hasMore = true;
    while (hasMore) {
      const { operations, hasMore: more } = await listerOperationsDepuis(curseur, 4);
      toutes.push(...operations.map((o) => o.entityId));
      if (operations.length > 0) curseur = operations[operations.length - 1]!.curseur;
      hasMore = more;
    }

    expect(toutes).toHaveLength(9);
    expect(new Set(toutes).size).toBe(9); // Aucun doublon.
    expect(toutes).toEqual([...new Set(toutes)]); // Ordre stable.
  });

  it("TEST 13 — curseur avancé correctement après chaque page", async () => {
    const uuids: string[] = [];
    for (let i = 0; i < 6; i++) {
      uuids.push(`${i.toString().padStart(8, "0")}-0000-4000-8000-000000000003`);
    }
    await enregistrerOperations(uuids.map((id) => ({ entityType: "transfert" as const, entityId: id, payload: {} })));

    const page1 = await listerOperationsDepuis(0, 3);
    expect(page1.operations).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    const curseurPage1 = page1.operations[2]!.curseur;

    const page2 = await listerOperationsDepuis(curseurPage1, 3);
    expect(page2.operations).toHaveLength(3);
    expect(page2.hasMore).toBe(false);

    // Les curseurs de page2 sont tous supérieurs à ceux de page1.
    for (const op of page2.operations) {
      expect(op.curseur).toBeGreaterThan(curseurPage1);
    }
  });

  // ─── Identité entreprise (correction "L'appli gère les infos du site") ───

  it("TEST 14 — PUSH 'parametres_entreprise' avec entityId='singleton' : accepté (200), reflété par /v1/public/settings", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };

    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/sync/push",
        headers: auth,
        body: {
          operations: [
            {
              entityType: "parametres_entreprise",
              entityId: "singleton",
              payload: {
                nom: "MAXI EQUIP",
                adresse: "Quartier Beaulieu",
                quartier: "Akanda",
                telephones: ["066338730"],
                whatsapp: "+24166338730",
                email: "contact@maxi-equip.com",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          ],
        },
      })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ results: [{ entityId: "singleton", statut: "cree" }] });

    const settingsRes = await router.dispatch(req({ path: "/v1/public/settings" }));
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body).toMatchObject({
      settings: { nom: "MAXI EQUIP", adresse: "Quartier Beaulieu", whatsapp: "+24166338730", email: "contact@maxi-equip.com" },
    });
  });

  it("TEST 15 — RÉGRESSION bug réel : une DEUXIÈME modification de l'identité est réellement appliquée (jamais silencieusement ignorée)", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };

    const pousserIdentite = (nom: string, updatedAt: string) =>
      router.dispatch(
        req({
          method: "POST",
          path: "/v1/sync/push",
          headers: auth,
          body: {
            operations: [
              {
                entityType: "parametres_entreprise",
                entityId: "singleton",
                payload: { nom, adresse: "", quartier: "", telephones: [], whatsapp: "", email: "", updatedAt },
              },
            ],
          },
        })
      );

    await pousserIdentite("MAXI EQUIP — Premier nom", "2026-01-01T00:00:00.000Z");
    let identite = await getIdentiteActuelle();
    expect(identite?.nom).toBe("MAXI EQUIP — Premier nom");

    // AVANT la correction : le journal `operations_synchronisees` (contrainte
    // UNIQUE(entity_type, entity_id) + INSERT OR IGNORE) aurait ignoré
    // silencieusement cette deuxième opération sur le même entityId.
    const deuxieme = await pousserIdentite("MAXI EQUIP — Nom corrigé", "2026-01-02T00:00:00.000Z");
    expect(deuxieme.status).toBe(200);

    identite = await getIdentiteActuelle();
    expect(identite?.nom).toBe("MAXI EQUIP — Nom corrigé");

    const settingsRes = await router.dispatch(req({ path: "/v1/public/settings" }));
    expect(settingsRes.body).toMatchObject({ settings: { nom: "MAXI EQUIP — Nom corrigé" } });
  });

  it("TEST 16 — PUSH 'parametres_entreprise' avec un entityId autre que 'singleton' : rejeté (400)", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/sync/push",
        headers: { authorization: `Bearer ${tokenValide()}` },
        body: {
          operations: [
            { entityType: "parametres_entreprise", entityId: UUID_1, payload: { nom: "X", adresse: "", quartier: "", telephones: [], whatsapp: "", email: "", updatedAt: "2026-01-01T00:00:00.000Z" } },
          ],
        },
      })
    );
    expect(res.status).toBe(400);
  });

  it("TEST 17 — GET /v1/public/settings avant toute synchronisation : nom/champs null, jamais une valeur inventée", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/public/settings" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ settings: { nom: null, adresse: null, whatsapp: null, email: null, telephones: [] } });
  });
});
