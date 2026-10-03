import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt, verifierJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-recuperation";

function tokenValide(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

describe("Récupération d'installation (mot de passe de récupération, stockage SQLite réel en mémoire)", () => {
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

  it("TEST 1 — definir-recuperation sans JWT : refusé (401), route de niveau app", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/app/installation/definir-recuperation", body: { motDePasse: "SuperSecret123" } })
    );
    expect(res.status).toBe(401);
  });

  it("TEST 2 — verifier-recuperation avant toute définition : 404 (aucune récupération configurée)", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "peu-importe" } })
    );
    expect(res.status).toBe(404);
  });

  it("TEST 3 — cycle complet : définir puis vérifier avec le bon mot de passe → 200, jeton réellement valide", async () => {
    const router = createRouter();

    const definirRes = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123" },
        headers: { authorization: `Bearer ${tokenValide()}` },
      })
    );
    expect(definirRes.status).toBe(200);

    const verifRes = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "SuperSecret123" } })
    );
    expect(verifRes.status).toBe(200);
    const corps = verifRes.body as { jwt: string; downloadUrls: unknown | null };
    expect(corps.jwt).toBeDefined();
    expect(corps.downloadUrls).toBeNull(); // aucune config B2 dans les tests

    const verification = verifierJwt(corps.jwt, SECRET_TEST);
    expect(verification.valide).toBe(true);
  });

  it("TEST 3b — cléChiffréeSauvegarde transmise à definir-recuperation ressort telle quelle à la vérification", async () => {
    const router = createRouter();
    const blob = { kdf: "scrypt", salt: "s1", iv: "iv1", cleChiffree: "ff", tag: "00" };

    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123", cleChiffreeSauvegarde: blob },
        headers: { authorization: `Bearer ${tokenValide()}` },
      })
    );

    const verifRes = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "SuperSecret123" } })
    );
    expect(verifRes.status).toBe(200);
    const corps = verifRes.body as { cleChiffreeSauvegarde: unknown };
    expect(corps.cleChiffreeSauvegarde).toEqual(blob);
  });

  it("TEST 3c — cléChiffréeCloudBackup transmise ressort telle quelle, distincte de cléChiffréeSauvegarde", async () => {
    const router = createRouter();
    const blobSauvegarde = { kdf: "scrypt", salt: "s1", iv: "iv1", cleChiffree: "ff", tag: "00" };
    const blobCloudBackup = { kdf: "scrypt", salt: "s2", iv: "iv2", cleChiffree: "aa", tag: "bb" };

    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123", cleChiffreeSauvegarde: blobSauvegarde, cleChiffreeCloudBackup: blobCloudBackup },
        headers: { authorization: `Bearer ${tokenValide()}` },
      })
    );

    const verifRes = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "SuperSecret123" } })
    );
    expect(verifRes.status).toBe(200);
    const corps = verifRes.body as { cleChiffreeSauvegarde: unknown; cleChiffreeCloudBackup: unknown };
    expect(corps.cleChiffreeSauvegarde).toEqual(blobSauvegarde);
    expect(corps.cleChiffreeCloudBackup).toEqual(blobCloudBackup);
  });

  it("TEST 4 — mauvais mot de passe : 401, jamais un 404 (distinction préservée)", async () => {
    const router = createRouter();
    await router.dispatch(
      req({
        method: "POST",
        path: "/v1/app/installation/definir-recuperation",
        body: { motDePasse: "SuperSecret123" },
        headers: { authorization: `Bearer ${tokenValide()}` },
      })
    );

    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "mauvais-mot-de-passe" } })
    );
    expect(res.status).toBe(401);
  });

  it("TEST 5 — redéfinir le mot de passe invalide l'ancien immédiatement", async () => {
    const router = createRouter();
    const auth = { authorization: `Bearer ${tokenValide()}` };
    await router.dispatch(req({ method: "POST", path: "/v1/app/installation/definir-recuperation", body: { motDePasse: "Ancien123" }, headers: auth }));
    await router.dispatch(req({ method: "POST", path: "/v1/app/installation/definir-recuperation", body: { motDePasse: "Nouveau456" }, headers: auth }));

    const ancienRefuse = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "Ancien123" } })
    );
    expect(ancienRefuse.status).toBe(401);

    const nouveauAccepte = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "Nouveau456" } })
    );
    expect(nouveauAccepte.status).toBe(200);
  });

  it("TEST 6 — limitation de fréquence réelle sur verifier-recuperation : la 6e tentative depuis la même IP est refusée (429)", async () => {
    const router = createRouter();
    const ip = "203.0.113.99";

    for (let i = 0; i < 5; i++) {
      const res = await router.dispatch(
        req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "essai" }, ip })
      );
      expect(res.status).toBe(404); // aucune récupération configurée, mais compte quand même comme tentative
    }

    const sixieme = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "essai" }, ip })
    );
    expect(sixieme.status).toBe(429);

    const autreIp = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "essai" }, ip: "198.51.100.50" })
    );
    expect(autreIp.status).toBe(404); // pas 429 — bien isolé par IP
  });

  it("TEST 7 — motDePasse manquant ou vide : 400 sur les deux routes", async () => {
    const router = createRouter();
    const defRes = await router.dispatch(
      req({ method: "POST", path: "/v1/app/installation/definir-recuperation", body: {}, headers: { authorization: `Bearer ${tokenValide()}` } })
    );
    expect(defRes.status).toBe(400);

    const verifRes = await router.dispatch(
      req({ method: "POST", path: "/v1/public/installation/verifier-recuperation", body: { motDePasse: "" } })
    );
    expect(verifRes.status).toBe(400);
  });
});
