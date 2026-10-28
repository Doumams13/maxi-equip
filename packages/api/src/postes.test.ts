import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

/**
 * Tests réels (vraie base SQLite en mémoire, vrai routage) — système
 * multiposte fiable (2026-10-28), Phase C (identité et registre des
 * postes). `postgresServerStorage.test.ts` couvre déjà la limite de 5
 * postes annexes sous une VRAIE concurrence PostgreSQL — ce fichier
 * couvre le comportement HTTP (routes, codes de statut, 404/403 sur
 * un jeton antérieur à cette correction).
 */

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-postes";

function tokenPour(sub: string): string {
  return signerJwt({ sub, role: "app" }, SECRET_TEST, 3600);
}

describe("Identité et registre des postes — HTTP (stockage SQLite réel en mémoire)", () => {
  beforeEach(() => {
    initialiserStockageServeur(":memory:");
    reinitialiserLimitationPourTests();
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
  });
  afterEach(() => {
    fermerStockageServeur();
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
  });

  async function verifierRecuperation(router: ReturnType<typeof createRouter>, ip: string) {
    return router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "SuperSecret123" }, ip })
    );
  }

  it("verifier-recuperation crée réellement une ligne postes et son sub devient l'id de ce poste", async () => {
    const router = createRouter();
    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123" },
        headers: { authorization: `Bearer ${tokenPour("installation-test")}` },
      })
    );

    const res = await verifierRecuperation(router, "203.0.113.10");
    expect(res.status).toBe(200);
    const { jwt } = res.body as { jwt: string };

    const moi = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/moi", headers: { authorization: `Bearer ${jwt}` } }));
    expect(moi.status).toBe(200);
    const { poste } = moi.body as { poste: { id: string; nom: string | null; role: string; statut: string } | null };
    expect(poste).not.toBeNull();
    expect(poste!.role).toBe("pcx");
    expect(poste!.nom).toBeNull();
    expect(poste!.statut).toBe("actif");
  });

  it("la 6e restauration réussie (mot de passe correct) est refusée avec 403 — la limite de 5 postes annexes est atteinte", async () => {
    const router = createRouter();
    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123" },
        headers: { authorization: `Bearer ${tokenPour("installation-test")}` },
      })
    );

    for (let i = 0; i < 5; i++) {
      const res = await verifierRecuperation(router, `203.0.113.${20 + i}`);
      expect(res.status).toBe(200);
    }

    const sixieme = await verifierRecuperation(router, "203.0.113.99");
    expect(sixieme.status).toBe(403);
  });

  it("postes/moi renvoie poste: null pour un jeton antérieur à cette correction (sub inconnu de postes)", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "GET", path: "/v1/app/postes/moi", headers: { authorization: `Bearer ${tokenPour("sub-jamais-enregistre")}` } })
    );
    expect(res.status).toBe(200);
    expect((res.body as { poste: unknown }).poste).toBeNull();
  });

  it("postes/definir-nom pour ce même jeton antérieur : 404 (jamais un succès silencieux)", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/postes/definir-nom",
        body: { nom: "PCX1 - Comptoir" },
        headers: { authorization: `Bearer ${tokenPour("sub-jamais-enregistre")}` },
      })
    );
    expect(res.status).toBe(404);
  });

  it("re-emettre-moi crée le poste Shop une seule fois, même appelé deux fois — jamais deux lignes 'shop'", async () => {
    const router = createRouter();
    const premier = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/re-emettre-moi", headers: { authorization: `Bearer ${tokenPour("ancien-sub-shop-jete")}` } })
    );
    expect(premier.status).toBe(200);
    const { jwt: jwt1, poste: poste1 } = premier.body as { jwt: string; poste: { id: string } };

    const second = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/re-emettre-moi", headers: { authorization: `Bearer ${tokenPour("autre-ancien-sub")}` } })
    );
    expect(second.status).toBe(200);
    const { poste: poste2 } = second.body as { poste: { id: string } };

    expect(poste2.id).toBe(poste1.id);

    const liste = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/list", headers: { authorization: `Bearer ${jwt1}` } }));
    const { postes } = liste.body as { postes: { role: string }[] };
    expect(postes.filter((p) => p.role === "shop")).toHaveLength(1);
  });

  it("définir-nom, bloquer, réautoriser et retirer un poste annexe fonctionnent de bout en bout", async () => {
    const router = createRouter();
    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123" },
        headers: { authorization: `Bearer ${tokenPour("installation-test")}` },
      })
    );
    const creation = await verifierRecuperation(router, "203.0.113.50");
    const { jwt } = creation.body as { jwt: string };
    const auth = { authorization: `Bearer ${jwt}` };

    // Les actions d'administration (bloquer/réautoriser/retirer) sont
    // réalisées par un AUTRE poste (Shop) — jamais le poste PCX agissant
    // sur lui-même : une fois bloqué, son propre jeton serait lui-même
    // refusé par authentifier() (système multiposte fiable, 2026-10-28),
    // ce qui est le comportement attendu, pas un problème de ce test.
    const adminCreation = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/re-emettre-moi", headers: { authorization: `Bearer ${tokenPour("ancien-sub-shop-admin")}` } })
    );
    const { jwt: jwtAdmin } = adminCreation.body as { jwt: string };
    const authAdmin = { authorization: `Bearer ${jwtAdmin}` };

    const moiAvant = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/moi", headers: auth }));
    const posteId = (moiAvant.body as { poste: { id: string } }).poste.id;

    const nom = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/definir-nom", body: { nom: "PCX1 - Comptoir" }, headers: auth })
    );
    expect(nom.status).toBe(200);
    const moiApresNom = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/moi", headers: auth }));
    expect((moiApresNom.body as { poste: { nom: string; id: string } }).poste).toMatchObject({ nom: "PCX1 - Comptoir", id: posteId });

    const bloquer = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/bloquer", body: { posteId }, headers: authAdmin })
    );
    expect(bloquer.status).toBe(200);

    // Le poste bloqué ne peut plus rien faire avec son propre jeton,
    // pas même consulter son propre statut — refusé dès réception,
    // conformément à l'exigence explicite de blocage à distance.
    const moiPendantBlocage = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/moi", headers: auth }));
    expect(moiPendantBlocage.status).toBe(403);

    const reautoriser = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/reautoriser", body: { posteId }, headers: authAdmin })
    );
    expect(reautoriser.status).toBe(200);

    // Réautorisé : le MÊME jeton (jamais régénéré) retrouve l'accès.
    const moiApresReautorisation = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/moi", headers: auth }));
    expect(moiApresReautorisation.status).toBe(200);

    const retirer = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/retirer", body: { posteId }, headers: authAdmin })
    );
    expect(retirer.status).toBe(200);

    const moiApresRetrait = await router.dispatch(req({ method: "GET", path: "/v1/app/postes/moi", headers: auth }));
    expect((moiApresRetrait.body as { poste: unknown }).poste).toBeNull();
  });

  it("le poste Shop ne peut jamais être bloqué ni retiré — 403", async () => {
    const router = createRouter();
    const creation = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/re-emettre-moi", headers: { authorization: `Bearer ${tokenPour("ancien-sub-shop")}` } })
    );
    const { jwt, poste } = creation.body as { jwt: string; poste: { id: string } };
    const auth = { authorization: `Bearer ${jwt}` };

    const bloquer = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/bloquer", body: { posteId: poste.id }, headers: auth })
    );
    expect(bloquer.status).toBe(403);

    const retirer = await router.dispatch(
      req({ method: "POST", path: "/v1/app/postes/retirer", body: { posteId: poste.id }, headers: auth })
    );
    expect(retirer.status).toBe(403);
  });
});
