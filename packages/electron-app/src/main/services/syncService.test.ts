import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "../repositories/syncRepository.js";
import { SyncService } from "./syncService.js";

/**
 * Tests réels du moteur de synchronisation (Phase 3.7, Partie 20) — avec
 * une VRAIE base SQLite (jamais un dépôt mocké) pour la boîte d'envoi et
 * le curseur local. Seul le transport réseau (`fetch`) est simulé ici,
 * précisément pour pouvoir provoquer à volonté chaque scénario d'erreur
 * demandé (serveur arrêté, réponse perdue, JWT invalide...) sans dépendre
 * d'un vrai serveur externe — un vrai serveur HTTP est testé séparément
 * pour le scénario 1 (voir le rapport, section correspondante).
 */

let db: Database.Database;
let boiteEnvoiRepository: BoiteEnvoiRepository;
let syncRepository: SyncRepository;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  db.prepare(
    "INSERT INTO utilisateurs (id, identifiant, nom, role, password_hash, actif, created_at, updated_at) VALUES ('u1','test','Testeur','administrateur','x',1,?,?)"
  ).run(new Date().toISOString(), new Date().toISOString());
  boiteEnvoiRepository = new BoiteEnvoiRepository(db);
  syncRepository = new SyncRepository(db);

  process.env["MAXI_EQUIP_API_URL"] = "http://localhost:9999";
  process.env["MAXI_EQUIP_SYNC_JWT"] = "jeton-de-test";
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  delete process.env["MAXI_EQUIP_API_URL"];
  delete process.env["MAXI_EQUIP_SYNC_JWT"];
});

function ajouterEntreeBoiteEnvoi(entityId = "11111111-1111-4111-8111-111111111111") {
  return boiteEnvoiRepository.creer("vente", entityId, { numero: "FAC-2026-0001", total: 5000 });
}

describe("SyncService — Phase 3.7 (base réelle, transport simulé)", () => {
  it("TEST 1 (partiel — voir rapport pour le test HTTP réel complet) : push + confirmation + pull + curseur, avec un serveur qui répond correctement", async () => {
    ajouterEntreeBoiteEnvoi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) {
          return new Response(JSON.stringify({ results: [{ entityId: "11111111-1111-4111-8111-111111111111", statut: "cree" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ operations: [{ curseur: 5, entityType: "entree", entityId: "x", payload: {}, recuLe: "" }], cursor: 5 }), {
          status: 200,
        });
      })
    );

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat).toMatchObject({ success: true, push: { envoyees: 1, confirmees: 1 }, pull: { recues: 1 } });
    expect(boiteEnvoiRepository.compterParStatut()["confirmed"]).toBe(1);
    expect(syncRepository.getDernierCurseur()).toBe(5);
    expect(db.prepare("SELECT COUNT(*) as n FROM sync_recu").get()).toMatchObject({ n: 1 });
  });

  it("TEST 2 — serveur arrêté (fetch rejette) : pas de crash, l'opération reste pending", async () => {
    const id = ajouterEntreeBoiteEnvoi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:9999");
      })
    );

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(false);
    expect(resultat.etape).toBe("push");
    expect(boiteEnvoiRepository.findById(id)?.status).toBe("pending");
  });

  it("TEST 3 — CAS CRITIQUE : réponse perdue après enregistrement serveur, la resoumission reçoit 'deja_traite' et confirme sans doublon", async () => {
    const id = ajouterEntreeBoiteEnvoi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) {
          return new Response(JSON.stringify({ results: [{ entityId: "11111111-1111-4111-8111-111111111111", statut: "deja_traite" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
      })
    );

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(true);
    expect(resultat.push).toMatchObject({ envoyees: 1, confirmees: 1 });
    expect(boiteEnvoiRepository.findById(id)?.status).toBe("confirmed");
  });

  it("TEST 4 — double synchronisation simultanée : une seule s'exécute réellement", async () => {
    ajouterEntreeBoiteEnvoi();
    let appelsFetch = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        appelsFetch++;
        await new Promise((r) => setTimeout(r, 20));
        if (url.includes("/sync/push")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
      })
    );

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const [r1, r2] = await Promise.all([service.executerSynchronisation(), service.executerSynchronisation()]);

    const succes = [r1, r2].filter((r) => r.success);
    const refus = [r1, r2].filter((r) => !r.success && r.message?.includes("déjà en cours"));
    expect(succes).toHaveLength(1);
    expect(refus).toHaveLength(1);
    expect(appelsFetch).toBe(2);
  });

  it("TEST 5 — JWT invalide (401 du serveur) : erreur propre, opération conservée", async () => {
    const id = ajouterEntreeBoiteEnvoi();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 401 })));

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(false);
    expect(resultat.etape).toBe("push");
    expect(boiteEnvoiRepository.findById(id)?.status).toBe("pending");
  });

  it("TEST 6 — JWT expiré (même code 401 côté serveur) : erreur propre, opération conservée", async () => {
    const id = ajouterEntreeBoiteEnvoi();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 401 })));
    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();
    expect(resultat.success).toBe(false);
    expect(boiteEnvoiRepository.findById(id)?.status).toBe("pending");
  });

  it("TEST 7 — données serveur invalides (JSON illisible pendant le PULL) : pas de corruption locale, curseur non avancé", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        return new Response("ceci n'est pas du JSON", { status: 200 });
      })
    );
    const curseurAvant = syncRepository.getDernierCurseur();
    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(false);
    expect(resultat.etape).toBe("pull");
    expect(syncRepository.getDernierCurseur()).toBe(curseurAvant);
    expect(db.prepare("SELECT COUNT(*) as n FROM sync_recu").get()).toMatchObject({ n: 0 });
  });

  it("TEST 8 — PULL : données reçues, conservation technique, curseur correct", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        return new Response(
          JSON.stringify({
            operations: [
              { curseur: 1, entityType: "entree", entityId: "aaa", payload: { quantite: 5 }, recuLe: "" },
              { curseur: 2, entityType: "transfert", entityId: "bbb", payload: { quantite: 2 }, recuLe: "" },
            ],
            cursor: 2,
          }),
          { status: 200 }
        );
      })
    );
    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.pull).toMatchObject({ recues: 2 });
    expect(syncRepository.getDernierCurseur()).toBe(2);
    const lignes = db.prepare("SELECT entity_id FROM sync_recu ORDER BY curseur_serveur").all() as { entity_id: string }[];
    expect(lignes.map((l) => l.entity_id)).toEqual(["aaa", "bbb"]);
    expect(db.prepare("SELECT COUNT(*) as n FROM mouvements").get()).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) as n FROM stocks").get()).toMatchObject({ n: 0 });
  });

  it("TEST 9 — erreur pendant le traitement du PULL (payload non sérialisable) : rollback, curseur non avancé", () => {
    const circulaire: Record<string, unknown> = {};
    circulaire["soi_meme"] = circulaire;
    const curseurAvant = syncRepository.getDernierCurseur();

    expect(() =>
      syncRepository.enregistrerOperationsRecues([
        { entityType: "entree", entityId: "valide", payload: { ok: true }, curseurServeur: 1 },
        { entityType: "transfert", entityId: "invalide", payload: circulaire, curseurServeur: 2 },
      ])
    ).toThrow();

    expect(syncRepository.getDernierCurseur()).toBe(curseurAvant);
    expect(db.prepare("SELECT COUNT(*) as n FROM sync_recu").get()).toMatchObject({ n: 0 });
  });

  it("Configuration absente (aucun JWT configuré) : erreur claire dès le départ, aucun appel réseau tenté", async () => {
    delete process.env["MAXI_EQUIP_SYNC_JWT"];
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(false);
    expect(resultat.etape).toBe("configuration");
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("Rien à envoyer : le push renvoie envoyees=0 sans jamais appeler le réseau pour le push", async () => {
    const fetchSimule = vi.fn(async () => new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSimule);

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    const resultat = await service.executerSynchronisation();

    expect(resultat.push).toEqual({ envoyees: 0, confirmees: 0 });
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });
});
