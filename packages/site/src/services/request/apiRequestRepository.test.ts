import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiRequestRepository, MESSAGE_SERVICE_INDISPONIBLE } from "./apiRequestRepository";
import type { OrderRequestInput } from "@/lib/types/request";

/**
 * Correction "Intégration Site Phase 5, §6" : "Ne jamais afficher une
 * erreur technique brute" ; "Ne pas faire croire qu'une demande a été
 * enregistrée si l'API n'a pas confirmé sa réception."
 */

const INPUT: OrderRequestInput = {
  customerName: "Client Test",
  phone: "+241 07 07 07 07",
  location: "Libreville",
  lines: [{ productModelId: "m1", productModelName: "Marbre Blanc", variantId: "v1", size: "60x60", quantity: 1, unitPriceFcfa: 15000 }],
};

describe("ApiRequestRepository — gestion des erreurs (jamais de message technique brut)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("panne réseau (fetch rejette) : message générique clair, jamais l'erreur JS brute", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const repo = new ApiRequestRepository("http://api.test");
    await expect(repo.submit(INPUT)).rejects.toThrow(MESSAGE_SERVICE_INDISPONIBLE);
  });

  it("erreur serveur 500 sans corps JSON exploitable : message générique, jamais le code HTTP brut exposé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Internal Server Error</html>", { status: 500 })));
    const repo = new ApiRequestRepository("http://api.test");
    await expect(repo.submit(INPUT)).rejects.toThrow(MESSAGE_SERVICE_INDISPONIBLE);
  });

  it("erreur 400 de validation : le message réel de l'API (forme { error: { message } }, voir core/errors.ts) est bien extrait et relayé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "validation_error", message: "Le champ 'phone' est obligatoire." } }), { status: 400 })));
    const repo = new ApiRequestRepository("http://api.test");
    await expect(repo.submit(INPUT)).rejects.toThrow("Le champ 'phone' est obligatoire.");
  });

  it("429 (limitation de fréquence) : le message réel de l'API est bien extrait et relayé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limited", message: "Trop de demandes envoyées récemment. Réessayez dans 120 secondes." } }), { status: 429 })));
    const repo = new ApiRequestRepository("http://api.test");
    await expect(repo.submit(INPUT)).rejects.toThrow("Trop de demandes envoyées récemment. Réessayez dans 120 secondes.");
  });

  it("succès réel : la demande n'est confirmée que si l'API répond effectivement 200 avec un requestId", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ requestId: "req-1", submittedAt: "2026-01-01T00:00:00.000Z" }), { status: 200 })));
    const repo = new ApiRequestRepository("http://api.test");
    const resultat = await repo.submit(INPUT);
    expect(resultat.requestId).toBe("req-1");
  });
});
