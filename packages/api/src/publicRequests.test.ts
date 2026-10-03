import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { initialiserStockageServeur, fermerStockageServeur, listerOperationsDepuis } from "./core/storeServeur.js";
import { reinitialiserLimitationPourTests } from "./core/rateLimiter.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

function demandeValide(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Client Site",
    phone: "+241 07 07 07 07",
    location: "Libreville, Akébé",
    email: "client@example.com",
    comment: "Livraison rapide si possible.",
    lines: [{ productModelId: "m1", productModelName: "Marbre Blanc", variantId: "v1-60x60", size: "60x60", quantity: 3, unitPriceFcfa: 15000 }],
    ...overrides,
  };
}

describe("Route publique POST /v1/public/requests — Intégration Site Phase 5 (stockage SQLite réel en mémoire)", () => {
  beforeEach(() => {
    initialiserStockageServeur(":memory:");
    reinitialiserLimitationPourTests();
  });
  afterEach(() => {
    fermerStockageServeur();
  });

  it("TEST 1 — soumission valide, sans JWT (route publique) : acceptée et réellement stockée comme opération 'demande'", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide() }));

    expect(res.status).toBe(200);
    const corps = res.body as { requestId: string; submittedAt: string };
    expect(corps.requestId).toBeDefined();
    expect(corps.submittedAt).toBeDefined();

    const { operations } = await listerOperationsDepuis(0);
    expect(operations).toHaveLength(1);
    expect(operations[0]!.entityType).toBe("demande");
    expect(operations[0]!.entityId).toBe(corps.requestId);
    const payload = operations[0]!.payload as { clientNom: string; lignes: { produitId: string; prixIndicatif: number }[] };
    expect(payload.clientNom).toBe("Client Site");
    expect(payload.lignes[0]!.produitId).toBe("v1-60x60");
    expect(payload.lignes[0]!.prixIndicatif).toBe(15000);
  });

  it("TEST 2 — champs obligatoires manquants : refusée avec un message clair, rien stocké", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide({ customerName: "" }) }));
    expect(res.status).toBe(400);
    expect((await listerOperationsDepuis(0)).operations).toHaveLength(0);
  });

  it("TEST 3 — email et commentaire réellement facultatifs", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/public/requests", body: demandeValide({ email: undefined, comment: undefined }) })
    );
    expect(res.status).toBe(200);
    const { operations } = await listerOperationsDepuis(0);
    const payload = operations[0]!.payload as { clientEmail: string | null; commentaire: string | null };
    expect(payload.clientEmail).toBeNull();
    expect(payload.commentaire).toBeNull();
  });

  it("TEST 4 — aucune ligne : refusée", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide({ lines: [] }) }));
    expect(res.status).toBe(400);
  });

  it("TEST 5 — quantité invalide (zéro, négative, non entière) : refusée", async () => {
    const router = createRouter();
    for (const quantity of [0, -1, 1.5]) {
      const res = await router.dispatch(
        req({
          method: "POST",
          path: "/v1/public/requests",
          body: demandeValide({ lines: [{ productModelId: "m1", productModelName: "X", variantId: "v1", size: "60x60", quantity, unitPriceFcfa: 1000 }] }),
        })
      );
      expect(res.status).toBe(400);
    }
  });

  it("TEST 6 — honeypot rempli : faux succès silencieux, RIEN n'est réellement stocké", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide({ websiteHoneypot: "je-suis-un-robot" }) }));

    expect(res.status).toBe(200);
    const corps = res.body as { requestId: string };
    expect(corps.requestId).toBeDefined();

    expect((await listerOperationsDepuis(0)).operations).toHaveLength(0);
  });

  it("TEST 7 — limitation de fréquence réelle : la 6e requête depuis la même IP en 10 minutes est refusée (429)", async () => {
    const router = createRouter();
    const ip = "203.0.113.42";

    for (let i = 0; i < 5; i++) {
      const res = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide(), ip }));
      expect(res.status).toBe(200);
    }

    const sixieme = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide(), ip }));
    expect(sixieme.status).toBe(429);

    const autreIp = await router.dispatch(req({ method: "POST", path: "/v1/public/requests", body: demandeValide(), ip: "198.51.100.7" }));
    expect(autreIp.status).toBe(200);
  });

  it("TEST 8 — JWT fourni mais route publique : ignoré, fonctionne quand même sans authentification", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({ method: "POST", path: "/v1/public/requests", body: demandeValide(), headers: { authorization: "Bearer un-jeton-quelconque-jamais-verifie-ici" } })
    );
    expect(res.status).toBe(200);
  });

  it("plusieurs lignes, prix et tailles différents, correctement transmis tels quels", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      req({
        method: "POST",
        path: "/v1/public/requests",
        body: demandeValide({
          lines: [
            { productModelId: "m1", productModelName: "Marbre Blanc", variantId: "v1-60x60", size: "60x60", quantity: 2, unitPriceFcfa: 15000 },
            { productModelId: "m2", productModelName: "Grès Anthracite", variantId: "v2-30x30", size: "30x30", quantity: 5, unitPriceFcfa: 8000 },
          ],
        }),
      })
    );
    expect(res.status).toBe(200);
    const { operations } = await listerOperationsDepuis(0);
    const payload = operations[0]!.payload as { lignes: { motif: string; taille: string; quantite: number; prixIndicatif: number }[] };
    expect(payload.lignes).toHaveLength(2);
    expect(payload.lignes[1]!.motif).toBe("Grès Anthracite");
    expect(payload.lignes[1]!.taille).toBe("30x30");
  });
});
