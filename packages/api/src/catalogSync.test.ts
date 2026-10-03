import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur, listerOperationsDepuis } from "./core/storeServeur.js";
import { listerModelesActifs, listerProduitsActifs, listerPromotionsActives } from "./core/catalogStore.js";

/**
 * Tests du pipeline catalogue — correction "Intégration Site Phase 5,
 * Partie 2". Vérifie le flux Electron (simulé ici par des appels HTTP
 * directs à /v1/sync/push, exactement le contrat que SyncService utilise
 * réellement) → API → projection catalogue serveur.
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-catalogue";
const MODELE_1 = "11111111-1111-4111-8111-111111111111";
const PRODUIT_1 = "22222222-2222-4222-8222-222222222222";
const PROMO_1 = "33333333-3333-4333-8333-333333333333";

function tokenValide(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function push(operations: unknown[]) {
  return { method: "POST" as const, path: "/v1/sync/push", headers: { authorization: `Bearer ${tokenValide()}` }, body: { operations } };
}

describe("Pipeline catalogue — Electron → outbox → API → projection serveur", () => {
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

  it("A — création d'un modèle : matérialisée dans la projection, avec un slug déterministe", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          {
            entityType: "modele",
            entityId: MODELE_1,
            payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" },
          },
        ])
      )
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ results: [{ entityId: MODELE_1, statut: "cree" }] });

    const modeles = await listerModelesActifs();
    expect(modeles).toHaveLength(1);
    expect(modeles[0]).toMatchObject({ id: MODELE_1, motif: "Marbre Blanc", type: "Faïence", slug: "marbre-blanc" });
  });

  it("B — modification d'un modèle déjà créé : la projection reflète les nouvelles valeurs", async () => {
    const router = createRouter();
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }]))
    );
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "update", modeleId: MODELE_1, motif: "Marbre Blanc XL", type: "Grès cérame", updatedAt: "2026-01-02T00:00:00.000Z" } }]))
    );

    const modeles = await listerModelesActifs();
    expect(modeles).toHaveLength(1);
    expect(modeles[0]).toMatchObject({ motif: "Marbre Blanc XL", type: "Grès cérame" });
  });

  it("C — suppression d'un modèle : disparaît des modèles actifs (soft delete propagé)", async () => {
    const router = createRouter();
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }]))
    );
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "delete", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-02T00:00:00.000Z" } }]))
    );

    expect(await listerModelesActifs()).toHaveLength(0);
  });

  it("D/E/F — variante : création, modification, suppression", async () => {
    const router = createRouter();
    await router.dispatch(
      req(push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "create", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000, updatedAt: "2026-01-01T00:00:00.000Z" } }]))
    );
    expect(await listerProduitsActifs()).toMatchObject([{ id: PRODUIT_1, prix: 15000, taille: "60x60" }]);

    await router.dispatch(
      req(push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "update", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 16000, updatedAt: "2026-01-02T00:00:00.000Z" } }]))
    );
    expect(await listerProduitsActifs()).toMatchObject([{ id: PRODUIT_1, prix: 16000 }]);

    await router.dispatch(
      req(push([{ entityType: "produit", entityId: PRODUIT_1, payload: { operation: "delete", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 16000, updatedAt: "2026-01-03T00:00:00.000Z" } }]))
    );
    expect(await listerProduitsActifs()).toHaveLength(0);
  });

  it("H — promotion : création ciblée, modification, suppression, table de jointure toujours cohérente", async () => {
    const router = createRouter();
    const payloadBase = {
      promotionId: PROMO_1,
      libelle: "Soldes",
      typeReduction: "pourcentage" as const,
      valeur: 20,
      perimetre: "cible" as const,
      produitIds: [PRODUIT_1],
      dateDebut: "2026-01-01T00:00:00.000Z",
      dateFin: "2026-01-31T00:00:00.000Z",
    };
    await router.dispatch(req(push([{ entityType: "promotion", entityId: PROMO_1, payload: { ...payloadBase, operation: "create", updatedAt: "2026-01-01T00:00:00.000Z" } }])));
    expect(await listerPromotionsActives()).toMatchObject([{ id: PROMO_1, produitIds: [PRODUIT_1] }]);

    await router.dispatch(req(push([{ entityType: "promotion", entityId: PROMO_1, payload: { ...payloadBase, valeur: 30, operation: "update", updatedAt: "2026-01-02T00:00:00.000Z" } }])));
    expect(await listerPromotionsActives()).toMatchObject([{ id: PROMO_1, valeur: 30 }]);

    await router.dispatch(req(push([{ entityType: "promotion", entityId: PROMO_1, payload: { ...payloadBase, operation: "delete", updatedAt: "2026-01-03T00:00:00.000Z" } }])));
    expect(await listerPromotionsActives()).toHaveLength(0);
  });

  it("J — idempotence : rejouer exactement la même opération ne crée aucun doublon et ne change rien", async () => {
    const router = createRouter();
    const op = { entityType: "modele", entityId: MODELE_1, payload: { operation: "create" as const, modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } };
    await router.dispatch(req(push([op])));
    await router.dispatch(req(push([op])));
    await router.dispatch(req(push([op])));
    expect(await listerModelesActifs()).toHaveLength(1);
  });

  it("K — ordre : une opération plus ancienne reçue APRÈS une plus récente n'écrase jamais l'état", async () => {
    const router = createRouter();
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Récent", type: "Faïence", updatedAt: "2026-01-05T00:00:00.000Z" } }]))
    );
    // Rejoue une version PLUS ANCIENNE en désordre (ex. retransmission après une panne réseau) :
    await router.dispatch(
      req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "update", modeleId: MODELE_1, motif: "Ancien (périmé)", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }]))
    );
    expect((await listerModelesActifs())[0]).toMatchObject({ motif: "Récent" });
  });

  it("I — synchronisation hors ligne puis reconnexion : un lot mêlant plusieurs opérations catalogue accumulées est appliqué dans l'ordre d'envoi", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          { entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "V1", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } },
          { entityType: "produit", entityId: PRODUIT_1, payload: { operation: "create", produitId: PRODUIT_1, modeleId: MODELE_1, taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "R1", prix: 1000, updatedAt: "2026-01-01T00:00:01.000Z" } },
        ])
      )
    );
    expect(res.status).toBe(200);
    expect(await listerModelesActifs()).toHaveLength(1);
    expect(await listerProduitsActifs()).toHaveLength(1);
  });

  it("Lot mixte catalogue + types hérités : chacun traité par le bon mécanisme, ordre de réponse préservé", async () => {
    const router = createRouter();
    const VENTE_ID = "44444444-4444-4444-8444-444444444444";
    const res = await router.dispatch(
      req(
        push([
          { entityType: "vente", entityId: VENTE_ID, payload: { total: 5000 } },
          { entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "V1", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } },
        ])
      )
    );
    expect(res.status).toBe(200);
    const corps = res.body as { results: { entityId: string; statut: string }[] };
    expect(corps.results).toHaveLength(2);
    expect(corps.results[0]).toMatchObject({ entityId: VENTE_ID, statut: "cree" });
    expect(corps.results[1]).toMatchObject({ entityId: MODELE_1, statut: "cree" });

    // La vente suit toujours le mécanisme hérité (journal, jamais la projection catalogue).
    expect((await listerOperationsDepuis(0)).operations).toMatchObject([{ entityType: "vente", entityId: VENTE_ID }]);
    expect(await listerModelesActifs()).toHaveLength(1);
  });

  it("Payload catalogue invalide en fin de lot : 400, RIEN n'est appliqué (ni le catalogue valide qui précède, ni le legacy)", async () => {
    const router = createRouter();
    const VENTE_ID = "55555555-5555-4555-8555-555555555555";
    const res = await router.dispatch(
      req(
        push([
          { entityType: "vente", entityId: VENTE_ID, payload: { total: 5000 } },
          { entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "V1", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } },
          { entityType: "produit", entityId: PRODUIT_1, payload: { operation: "create", produitId: PRODUIT_1 /* champs obligatoires manquants */ } },
        ])
      )
    );
    expect(res.status).toBe(400);
    expect(await listerModelesActifs()).toHaveLength(0);
    expect((await listerOperationsDepuis(0)).operations).toHaveLength(0);
  });

  it("M — le DTO de projection ne peut structurellement pas transporter de stock/coût/fournisseur (aucun de ces champs n'existe dans le payload accepté)", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req(
        push([
          {
            entityType: "produit",
            entityId: PRODUIT_1,
            payload: {
              operation: "create",
              produitId: PRODUIT_1,
              modeleId: MODELE_1,
              taille: "60x60",
              tailleTri: 3600,
              largeur: 60,
              hauteur: 60,
              reference: "R1",
              prix: 1000,
              updatedAt: "2026-01-01T00:00:00.000Z",
              // Champs internes volontairement injectés pour vérifier qu'ils sont ignorés :
              seuilAlerte: 5,
              stock: 999,
              fournisseur: "Fournisseur X",
              prixAchat: 500,
            },
          },
        ])
      )
    );
    expect(res.status).toBe(200);
    const produits = await listerProduitsActifs();
    expect(produits).toHaveLength(1);
    expect(produits[0]).not.toHaveProperty("seuilAlerte");
    expect(produits[0]).not.toHaveProperty("stock");
    expect(produits[0]).not.toHaveProperty("fournisseur");
    expect(produits[0]).not.toHaveProperty("prixAchat");
    expect(JSON.stringify(produits[0])).not.toContain("Fournisseur X");
  });

  it("Collision de slug : deux modèles avec le même motif reçoivent des slugs distincts et déterministes", async () => {
    const router = createRouter();
    const MODELE_2 = "66666666-6666-4666-8666-666666666666";
    await router.dispatch(req(push([{ entityType: "modele", entityId: MODELE_1, payload: { operation: "create", modeleId: MODELE_1, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }])));
    await router.dispatch(req(push([{ entityType: "modele", entityId: MODELE_2, payload: { operation: "create", modeleId: MODELE_2, motif: "Marbre Blanc", type: "Faïence", updatedAt: "2026-01-01T00:00:00.000Z" } }])));

    const slugs = (await listerModelesActifs()).map((m) => m.slug).sort();
    expect(slugs).toEqual(["marbre-blanc", "marbre-blanc-2"]);
  });
});
