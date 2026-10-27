import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";
import { hasherMotDePasse } from "./core/argon2Hasher.js";

/**
 * Correction "travail à distance / plusieurs machines en parallèle"
 * (2026-10-22) — tests de bout en bout des trois nouvelles routes
 * (login, push d'un compte, validation de stock) contre le vrai routeur
 * (`createRouter().dispatch`), exactement le chemin que l'app Electron
 * emprunte réellement (jamais un appel direct aux fonctions `core/*` qui
 * contournerait l'authentification/la validation des routes).
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-comptes";
const COMPTE_ADMIN = "44444444-4444-4444-8444-444444444444";

function tokenInstallation(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function pushCompte(payload: Record<string, unknown>) {
  return {
    method: "POST" as const,
    path: "/v1/sync/push",
    headers: { authorization: `Bearer ${tokenInstallation()}` },
    body: { operations: [{ entityType: "compte", entityId: payload["compteId"], payload }] },
  };
}

function login(identifiant: string, motDePasse: string, ip?: string) {
  return { method: "POST" as const, path: "/v1/app/auth/login", headers: { authorization: `Bearer ${tokenInstallation()}` }, body: { identifiant, motDePasse }, ip };
}

function validerStock(body: unknown) {
  return { method: "POST" as const, path: "/v1/app/operations/valider", headers: { authorization: `Bearer ${tokenInstallation()}` }, body };
}

describe("Comptes utilisateurs centralisés — push + login (bout en bout)", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
    reinitialiserLimitationPourTests();
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    fermerStockageServeur();
  });

  it("un compte poussé via /sync/push peut ensuite se connecter via /app/auth/login", async () => {
    const router = createRouter();
    const hash = await hasherMotDePasse("mot-de-passe-valide-123");

    const resPush = await router.dispatch(
      req(
        pushCompte({
          operation: "create",
          compteId: COMPTE_ADMIN,
          identifiant: "admin.shop",
          hashMotDePasse: hash,
          nom: "Jean Dupont",
          role: "administrateur",
          actif: true,
          updatedAt: "2026-01-01T00:00:00.000Z",
        })
      )
    );
    expect(resPush.status).toBe(200);

    const resLogin = await router.dispatch(req(login("admin.shop", "mot-de-passe-valide-123")));
    expect(resLogin.status).toBe(200);
    const body = resLogin.body as { success: boolean; jwt: string; compte: { identifiant: string; role: string } };
    expect(body.success).toBe(true);
    expect(body.compte).toMatchObject({ identifiant: "admin.shop", role: "administrateur" });
    expect(typeof body.jwt).toBe("string");
  });

  it("mauvais mot de passe → 401 avec un message générique", async () => {
    const router = createRouter();
    const hash = await hasherMotDePasse("bon-mot-de-passe");
    await router.dispatch(
      req(pushCompte({ operation: "create", compteId: COMPTE_ADMIN, identifiant: "admin.shop", hashMotDePasse: hash, nom: "Jean", role: "administrateur", actif: true, updatedAt: "2026-01-01T00:00:00.000Z" }))
    );

    const res = await router.dispatch(req(login("admin.shop", "mauvais-mot-de-passe")));
    expect(res.status).toBe(401);
    expect((res.body as { error: { message: string } }).error.message).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("identifiant inconnu → EXACTEMENT le même message et statut que mauvais mot de passe (pas d'énumération de comptes)", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(login("jamais-cree", "peu-importe")));
    expect(res.status).toBe(401);
    expect((res.body as { error: { message: string } }).error.message).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("compte désactivé → refus, même avec le bon mot de passe", async () => {
    const router = createRouter();
    const hash = await hasherMotDePasse("bon-mot-de-passe");
    await router.dispatch(
      req(pushCompte({ operation: "create", compteId: COMPTE_ADMIN, identifiant: "gerant.desactive", hashMotDePasse: hash, nom: "Awa", role: "gerant", actif: false, updatedAt: "2026-01-01T00:00:00.000Z" }))
    );

    const res = await router.dispatch(req(login("gerant.desactive", "bon-mot-de-passe")));
    expect(res.status).toBe(401);
  });

  it("limitation de fréquence : après 5 échecs sur le même identifiant+IP, la 6e tentative est bloquée (429)", async () => {
    const router = createRouter();
    for (let i = 0; i < 5; i++) {
      const res = await router.dispatch(req(login("inconnu.bruteforce", "mauvais", "203.0.113.5")));
      expect(res.status).toBe(401);
    }
    const sixieme = await router.dispatch(req(login("inconnu.bruteforce", "mauvais", "203.0.113.5")));
    expect(sixieme.status).toBe(429);

    // Une autre IP sur le MÊME identifiant n'est pas affectée (clé = identifiant + IP, jamais IP seule ni identifiant seul).
    const autreIp = await router.dispatch(req(login("inconnu.bruteforce", "mauvais", "203.0.113.99")));
    expect(autreIp.status).toBe(401);
  });

  it("requête de login mal formée (champs manquants) → 400, jamais 401/500", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/app/auth/login", headers: { authorization: `Bearer ${tokenInstallation()}` }, body: { identifiant: "" } }));
    expect(res.status).toBe(400);
  });

  it("login sans jeton d'installation (Bearer) → 401, jamais exécuté sans authentification app", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/app/auth/login", headers: {}, body: { identifiant: "admin.shop", motDePasse: "x" } }));
    expect(res.status).toBe(401);
  });
});

describe("Validation atomique du stock partagé — route /app/operations/valider (bout en bout)", () => {
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

  const PRODUIT = "55555555-5555-4555-8555-555555555555";
  const DEPOT = "66666666-6666-4666-8666-666666666666";

  it("entrée de stock puis vente dans la limite disponible — succès, stock réellement mis à jour", async () => {
    const router = createRouter();
    await router.dispatch(req(validerStock({ deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: 5 }] })));

    const res = await router.dispatch(
      req(validerStock({ deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: -2 }], demandeNumeroFacture: { prefix: "F-2026-" } }))
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, numero: "F-2026-0001", stockApres: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: 3 }] });
  });

  it("vente qui dépasse le stock disponible → 200 avec success:false (résultat métier, jamais une erreur HTTP)", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(validerStock({ deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: -1 }] })));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: false, raison: "stock_insuffisant" });
  });

  it("corps invalide (deltas manquant) → 400", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(validerStock({})));
    expect(res.status).toBe(400);
  });

  it("delta à 0 est rejeté (toujours une variation réelle, jamais une opération sans effet)", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(validerStock({ deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: 0 }] })));
    expect(res.status).toBe(400);
  });

  it("sans jeton d'installation → 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/app/operations/valider", headers: {}, body: { deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: 1 }] } }));
    expect(res.status).toBe(401);
  });
});

describe("Amorçage ponctuel du stock central — route /app/operations/initialiser-stock (correction 'pc annexe ne peut pas vendre malgré le stock réel')", () => {
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

  const PRODUIT = "55555555-5555-4555-8555-555555555555";
  const DEPOT = "66666666-6666-4666-8666-666666666666";

  function initialiserStock(body: unknown) {
    return { method: "POST" as const, path: "/v1/app/operations/initialiser-stock", headers: { authorization: `Bearer ${tokenInstallation()}` }, body };
  }

  it("fixe une quantité ABSOLUE — une vente dans cette limite réussit ensuite", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(initialiserStock({ lignes: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: 29 }] })));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lignesAppliquees: 1 });

    const vente = await router.dispatch(req(validerStock({ deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: -16 }] })));
    expect(vente.body).toMatchObject({ success: true, stockApres: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: 13 }] });
  });

  it("appelée une seconde fois : REMPLACE la quantité précédente (absolue, jamais cumulée)", async () => {
    const router = createRouter();
    await router.dispatch(req(initialiserStock({ lignes: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: 29 }] })));
    await router.dispatch(req(initialiserStock({ lignes: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: 5 }] })));

    const vente = await router.dispatch(req(validerStock({ deltas: [{ produitId: PRODUIT, emplacementId: DEPOT, delta: -6 }] })));
    expect(vente.body).toMatchObject({ success: false, raison: "stock_insuffisant", details: [{ disponible: 5, demande: 6 }] });
  });

  it("plusieurs lignes en une seule requête, toutes appliquées", async () => {
    const router = createRouter();
    const DEPOT_2 = "77777777-7777-4777-8777-777777777777";
    const res = await router.dispatch(
      req(
        initialiserStock({
          lignes: [
            { produitId: PRODUIT, emplacementId: DEPOT, quantite: 29 },
            { produitId: PRODUIT, emplacementId: DEPOT_2, quantite: 4 },
          ],
        })
      )
    );
    expect(res.body).toMatchObject({ lignesAppliquees: 2 });
  });

  it("corps invalide (lignes manquant) → 400", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(initialiserStock({})));
    expect(res.status).toBe(400);
  });

  it("quantité négative rejetée", async () => {
    const router = createRouter();
    const res = await router.dispatch(req(initialiserStock({ lignes: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: -1 }] })));
    expect(res.status).toBe(400);
  });

  it("sans jeton d'installation → 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/app/operations/initialiser-stock", headers: {}, body: { lignes: [{ produitId: PRODUIT, emplacementId: DEPOT, quantite: 1 }] } })
    );
    expect(res.status).toBe(401);
  });
});
