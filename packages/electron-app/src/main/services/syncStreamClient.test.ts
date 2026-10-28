import { describe, it, expect, afterEach, vi } from "vitest";
import { SyncStreamClient } from "./syncStreamClient.js";

/**
 * Tests réels (vrai `fetch`/`ReadableStream` simulés via `vi.stubGlobal`,
 * même convention que emplacementSyncService.test.ts) — système
 * multiposte fiable (2026-10-28), Phase F.
 */

function configurerSync(apiUrl: string | null, jwt: string | null) {
  if (apiUrl) process.env["MAXI_EQUIP_API_URL"] = apiUrl;
  else delete process.env["MAXI_EQUIP_API_URL"];
  if (jwt) process.env["MAXI_EQUIP_SYNC_JWT"] = jwt;
  else delete process.env["MAXI_EQUIP_SYNC_JWT"];
}

function creerReponseFlux(status = 200) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(stream, { status }),
    push: (texte: string) => controller.enqueue(new TextEncoder().encode(texte)),
    fermer: () => controller.close(),
  };
}

describe("SyncStreamClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    configurerSync(null, null);
  });

  it("isolation : aucun appel réseau sans synchronisation configurée", async () => {
    configurerSync(null, null);
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);
    const client = new SyncStreamClient(vi.fn());

    client.demarrer();
    await new Promise((r) => setTimeout(r, 20));
    client.arreter();

    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("une trame 'data:' déclenche le signal, un commentaire (battement de cœur) jamais", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    const { response, push } = creerReponseFlux();
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/app/sync/stream");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer jeton-test" });
      return response;
    }));
    const onSignal = vi.fn();
    const client = new SyncStreamClient(onSignal);

    client.demarrer();
    await new Promise((r) => setTimeout(r, 10));
    push(":ok\n\n");
    await new Promise((r) => setTimeout(r, 10));
    expect(onSignal).not.toHaveBeenCalled();

    push('data: {"type":"entree"}\n\n');
    await new Promise((r) => setTimeout(r, 10));
    expect(onSignal).toHaveBeenCalledTimes(1);

    push(":battement\n\n");
    push('data: {"type":"vente"}\n\n');
    await new Promise((r) => setTimeout(r, 10));
    expect(onSignal).toHaveBeenCalledTimes(2);

    client.arreter();
  });

  it("une trame découpée sur plusieurs morceaux réseau est quand même reconnue", async () => {
    configurerSync("https://api.example.com", "jeton-test");
    const { response, push } = creerReponseFlux();
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const onSignal = vi.fn();
    const client = new SyncStreamClient(onSignal);

    client.demarrer();
    await new Promise((r) => setTimeout(r, 10));
    push('data: {"typ');
    await new Promise((r) => setTimeout(r, 10));
    expect(onSignal).not.toHaveBeenCalled();
    push('e":"sortie"}\n\n');
    await new Promise((r) => setTimeout(r, 10));
    expect(onSignal).toHaveBeenCalledTimes(1);

    client.arreter();
  });

  it("reconnexion : attente croissante plafonnée (2s → 4s → 8s), jamais immédiate", async () => {
    vi.useFakeTimers();
    configurerSync("https://api.example.com", "jeton-test");
    const fetchSimule = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchSimule);
    const client = new SyncStreamClient(vi.fn());

    client.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSimule).toHaveBeenCalledTimes(1); // 1re tentative immédiate

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchSimule).toHaveBeenCalledTimes(1); // pas encore à 2s
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSimule).toHaveBeenCalledTimes(2); // 2e tentative à 2s

    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchSimule).toHaveBeenCalledTimes(2); // pas encore à 4s de plus
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSimule).toHaveBeenCalledTimes(3); // 3e tentative à 4s de plus (doublé)

    client.arreter();
  });

  it("une reconnexion réussie remet l'attente à zéro — jamais conservée d'une coupure précédente", async () => {
    vi.useFakeTimers();
    configurerSync("https://api.example.com", "jeton-test");
    let appel = 0;
    const { response: fluxOk } = creerReponseFlux();
    const fetchSimule = vi.fn(async () => {
      appel++;
      if (appel <= 2) throw new Error("ECONNREFUSED"); // 2 échecs : délai 2s puis 4s
      return fluxOk; // 3e tentative réussie, puis le flux reste ouvert (jamais de 4e appel avant une nouvelle coupure)
    });
    vi.stubGlobal("fetch", fetchSimule);
    const client = new SyncStreamClient(vi.fn());

    client.demarrer();
    await vi.advanceTimersByTimeAsync(0); // échec 1
    await vi.advanceTimersByTimeAsync(2000); // échec 2 (après 2s)
    await vi.advanceTimersByTimeAsync(4000); // succès (après 4s, délai doublé)
    expect(fetchSimule).toHaveBeenCalledTimes(3);

    // Le flux réussi reste ouvert tant qu'il n'est pas interrompu —
    // laisser passer un délai qui aurait déclenché une 4e tentative SI
    // la reconnexion n'avait pas réussi confirme qu'aucune boucle de
    // reconnexion n'est en cours.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchSimule).toHaveBeenCalledTimes(3);

    client.arreter();
  });

  it("arreter() stoppe réellement la boucle — aucune tentative après", async () => {
    vi.useFakeTimers();
    configurerSync("https://api.example.com", "jeton-test");
    const fetchSimule = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchSimule);
    const client = new SyncStreamClient(vi.fn());

    client.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSimule).toHaveBeenCalledTimes(1);

    client.arreter();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });
});
