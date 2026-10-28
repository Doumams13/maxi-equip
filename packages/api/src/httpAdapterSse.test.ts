import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { createRouter } from "./index.js";
import { creerGestionnaireHttp } from "./core/httpAdapter.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { signerJwt } from "./core/jwt.js";
import { reinitialiserPosteEventBusPourTests } from "./core/posteEventBus.js";

/**
 * Tests réels — système multiposte fiable (2026-10-28), Phase F. Un
 * VRAI serveur HTTP est démarré (même construction que
 * local-dev-server.ts) : le flux SSE vit dans `httpAdapter.ts`, un
 * niveau SOUS `Router.dispatch()` (voir son commentaire — connexion
 * longue durée, jamais testable via `router.dispatch()` seul comme le
 * reste de cette suite).
 */

const SECRET_TEST = "secret-test-sse";
let server: Server;
let baseUrl: string;

function tokenPour(sub: string): string {
  return signerJwt({ sub, role: "app" }, SECRET_TEST, 3600);
}

beforeEach(async () => {
  process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
  process.env["MAXI_EQUIP_ENV"] = "test";
  initialiserStockageServeur(":memory:");
  // Le bus d'évènements est un singleton par PROCESSUS (voir
  // posteEventBus.ts) — jamais partagé entre tests réels d'un même
  // fichier, qui démarrent chacun leur propre serveur/port.
  reinitialiserPosteEventBusPourTests();
  const router = createRouter();
  server = createServer(creerGestionnaireHttp(router));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const adresse = server.address();
  const port = typeof adresse === "object" && adresse ? adresse.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fermerStockageServeur();
  delete process.env["JWT_SIGNING_SECRET"];
  delete process.env["MAXI_EQUIP_ENV"];
});

/** Lit les lignes SSE déjà reçues jusqu'ici, sans attendre la fin du flux (qui ne se termine jamais tant qu'on ne l'interrompt pas). */
async function lireProchaineTrame(reader: ReadableStreamDefaultReader<Uint8Array>, decodeur: TextDecoder): Promise<string> {
  const { value, done } = await reader.read();
  if (done) return "";
  return decodeur.decode(value);
}

describe("GET /v1/app/sync/stream (flux SSE réel — système multiposte fiable, 2026-10-28)", () => {
  it("sans Authorization : 401, jamais une connexion ouverte", async () => {
    const res = await fetch(`${baseUrl}/v1/app/sync/stream`);
    expect(res.status).toBe(401);
  });

  it("jeton invalide : 401", async () => {
    const res = await fetch(`${baseUrl}/v1/app/sync/stream`, { headers: { Authorization: "Bearer un-jeton-invente" } });
    expect(res.status).toBe(401);
  });

  it("jeton cryptographiquement valide (sub inconnu de postes) : 200, text/event-stream, battement initial reçu", async () => {
    const res = await fetch(`${baseUrl}/v1/app/sync/stream`, { headers: { Authorization: `Bearer ${tokenPour("sub-jamais-enregistre")}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const trame = await lireProchaineTrame(reader, new TextDecoder());
    expect(trame).toContain(":ok");
    await reader.cancel();
  });

  it("poste bloqué : 403, jamais une connexion ouverte", async () => {
    const { getStorage } = await import("./core/storeServeur.js");
    const creationPoste = await getStorage().creerPosteAnnexeSiLimiteNonAtteinte(new Date().toISOString());
    expect(creationPoste.success).toBe(true);
    if (!creationPoste.success) return;
    const jwtPcx = signerJwt({ sub: creationPoste.poste.id }, SECRET_TEST, 3600);

    await getStorage().bloquerPoste(creationPoste.poste.id, new Date().toISOString());

    const res = await fetch(`${baseUrl}/v1/app/sync/stream`, { headers: { Authorization: `Bearer ${jwtPcx}` } });
    expect(res.status).toBe(403);
  });

  it("une opération poussée par un AUTRE poste diffuse un signal minimal sur le flux déjà ouvert", async () => {
    const res = await fetch(`${baseUrl}/v1/app/sync/stream`, { headers: { Authorization: `Bearer ${tokenPour("poste-abonne")}` } });
    const reader = res.body!.getReader();
    const decodeur = new TextDecoder();
    await lireProchaineTrame(reader, decodeur); // consomme le ":ok" initial

    await fetch(`${baseUrl}/v1/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPour("poste-emetteur")}` },
      body: JSON.stringify({ operations: [{ entityType: "entree", entityId: "11111111-1111-4111-8111-111111111111", payload: { quantite: 5 } }] }),
    });

    const trame = await lireProchaineTrame(reader, decodeur);
    expect(trame).toContain("data:");
    expect(JSON.parse(trame.replace("data:", "").trim())).toEqual({ type: "entree" });
    await reader.cancel();
  });

  it("bloquer un poste pendant que son flux est déjà ouvert le ferme ACTIVEMENT (Phase D/F) — jamais seulement son prochain cycle de synchro refusé", async () => {
    const { getStorage } = await import("./core/storeServeur.js");
    const creationPoste = await getStorage().creerPosteAnnexeSiLimiteNonAtteinte(new Date().toISOString());
    expect(creationPoste.success).toBe(true);
    if (!creationPoste.success) return;
    const jwtPcx = signerJwt({ sub: creationPoste.poste.id }, SECRET_TEST, 3600);

    const reemission = await fetch(`${baseUrl}/v1/app/postes/re-emettre-moi`, { method: "POST", headers: { Authorization: `Bearer ${tokenPour("ancien-sub-shop")}` } });
    const { jwt: jwtShop } = (await reemission.json()) as { jwt: string };

    const res = await fetch(`${baseUrl}/v1/app/sync/stream`, { headers: { Authorization: `Bearer ${jwtPcx}` } });
    const reader = res.body!.getReader();
    await lireProchaineTrame(reader, new TextDecoder()); // ":ok" — connexion bien ouverte

    const bloquer = await fetch(`${baseUrl}/v1/app/postes/bloquer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwtShop}` },
      body: JSON.stringify({ posteId: creationPoste.poste.id }),
    });
    expect(bloquer.status).toBe(200);

    const { done } = await Promise.race([
      reader.read(),
      new Promise<{ done: boolean }>((_, reject) => setTimeout(() => reject(new Error("timeout — la connexion n'a jamais été fermée")), 2000)),
    ]);
    expect(done).toBe(true);
  });

  it("une opération déjà traitée (doublon) ne diffuse AUCUN second signal — jamais un bruit inutile", async () => {
    const entityId = "22222222-2222-4222-8222-222222222222";
    const corps = JSON.stringify({ operations: [{ entityType: "vente", entityId, payload: { numero: "FAC-1" } }] });
    await fetch(`${baseUrl}/v1/sync/push`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPour("poste-x")}` }, body: corps });

    const res = await fetch(`${baseUrl}/v1/app/sync/stream`, { headers: { Authorization: `Bearer ${tokenPour("poste-observateur")}` } });
    const reader = res.body!.getReader();
    const decodeur = new TextDecoder();
    await lireProchaineTrame(reader, decodeur); // ":ok"

    // Même opération repoussée (retry) — déjà "deja_traite" côté serveur.
    await fetch(`${baseUrl}/v1/sync/push`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPour("poste-x")}` }, body: corps });

    const course = Promise.race([
      lireProchaineTrame(reader, decodeur).then(() => "trame-recue"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 300)),
    ]);
    expect(await course).toBe("timeout");
    await reader.cancel();
  });
});
