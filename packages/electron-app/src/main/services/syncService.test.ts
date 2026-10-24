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

  it("RÉGRESSION bug réel (sync bloquée après plusieurs tâches) : push et pull sont bornés par un AbortSignal, jamais un fetch sans timeout", async () => {
    const signauxRecus: (AbortSignal | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        signauxRecus.push(init?.signal ?? undefined);
        return new Response(JSON.stringify({ results: [], operations: [], cursor: 0 }), { status: 200 });
      })
    );

    const service = new SyncService(boiteEnvoiRepository, syncRepository);
    await service.executerSynchronisation(); // rien dans la boîte d'envoi → seul le PULL appelle fetch ici

    expect(signauxRecus.length).toBeGreaterThan(0);
    for (const signal of signauxRecus) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
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

  it("Phase 4.1 — une opération 'demande' reçue via PULL est réellement appliquée aux données métier (callback), contrairement aux autres types (journal technique uniquement)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        return new Response(
          JSON.stringify({
            operations: [
              { curseur: 1, entityType: "demande", entityId: "site-demande-1", payload: { clientNom: "Client Site" }, recuLe: "" },
              { curseur: 2, entityType: "entree", entityId: "mvt-1", payload: { quantite: 5 }, recuLe: "" },
            ],
            cursor: 2,
          }),
          { status: 200 }
        );
      })
    );

    const demandesTraitees: { payload: unknown; sourceEntityId: string }[] = [];
    const service = new SyncService(boiteEnvoiRepository, syncRepository, (payload, sourceEntityId) => {
      demandesTraitees.push({ payload, sourceEntityId });
    });
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(true);
    expect(demandesTraitees).toHaveLength(1); // Uniquement la demande, jamais l'entrée de stock.
    expect(demandesTraitees[0]!.sourceEntityId).toBe("site-demande-1");
    expect((demandesTraitees[0]!.payload as { clientNom: string }).clientNom).toBe("Client Site");
    // Les deux opérations restent journalisées techniquement, comme avant (Partie 17 : ne rien casser).
    expect(db.prepare("SELECT COUNT(*) as n FROM sync_recu").get()).toMatchObject({ n: 2 });
  });

  it("Phase 4.1 — une erreur dans le traitement d'une demande n'interrompt jamais le reste de la synchronisation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        return new Response(JSON.stringify({ operations: [{ curseur: 1, entityType: "demande", entityId: "x", payload: {}, recuLe: "" }], cursor: 1 }), {
          status: 200,
        });
      })
    );

    const service = new SyncService(boiteEnvoiRepository, syncRepository, () => {
      throw new Error("Echec volontaire de traitement metier");
    });
    const resultat = await service.executerSynchronisation();

    expect(resultat.success).toBe(true); // La synchronisation elle-même reste réussie.
    expect(syncRepository.getDernierCurseur()).toBe(1); // Le curseur a bien avancé malgré l'échec métier isolé.
  });

  describe("Intégration Site Phase 5, Partie 2 — routage des images", () => {
    it("une entrée 'image_produit' est envoyée à /v1/app/images/sync, jamais dans le lot /v1/sync/push", async () => {
      boiteEnvoiRepository.creer("image_produit", "image-1", { operation: "create", imageId: "image-1", modeleId: "modele-1", contentBase64: "abc", contentType: "image/png", updatedAt: "x" });

      const appelsPush: unknown[] = [];
      const appelsImage: unknown[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, options?: RequestInit) => {
          if (url.includes("/app/images/sync")) {
            appelsImage.push(JSON.parse(options!.body as string));
            return new Response(JSON.stringify({ success: true, url: "http://api/v1/public/images?file=x.png" }), { status: 200 });
          }
          if (url.includes("/sync/push")) {
            appelsPush.push(JSON.parse(options!.body as string));
            return new Response(JSON.stringify({ results: [] }), { status: 200 });
          }
          return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
        })
      );

      const service = new SyncService(boiteEnvoiRepository, syncRepository);
      const resultat = await service.executerSynchronisation();

      expect(resultat).toMatchObject({ success: true, push: { envoyees: 1, confirmees: 1 } });
      expect(appelsImage).toHaveLength(1);
      expect(appelsPush).toHaveLength(0); // Aucun appel au lot générique — rien d'autre à envoyer.
      expect(boiteEnvoiRepository.compterParStatut()["confirmed"]).toBe(1);
    });

    it("images ET opérations génériques dans la même synchronisation : chacune empruntant son propre chemin, toutes confirmées", async () => {
      ajouterEntreeBoiteEnvoi(); // une "vente"
      boiteEnvoiRepository.creer("modele", "modele-1", { operation: "create", modeleId: "modele-1", motif: "X", type: "Y", updatedAt: "x" });
      boiteEnvoiRepository.creer("image_produit", "image-1", { operation: "delete", imageId: "image-1", modeleId: "modele-1", updatedAt: "x" });

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/app/images/sync")) return new Response(JSON.stringify({ success: true }), { status: 200 });
          if (url.includes("/sync/push")) {
            return new Response(
              JSON.stringify({ results: [{ entityId: "11111111-1111-4111-8111-111111111111", statut: "cree" }, { entityId: "modele-1", statut: "cree" }] }),
              { status: 200 }
            );
          }
          return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
        })
      );

      const service = new SyncService(boiteEnvoiRepository, syncRepository);
      const resultat = await service.executerSynchronisation();

      expect(resultat).toMatchObject({ success: true, push: { envoyees: 3, confirmees: 3 } });
      expect(boiteEnvoiRepository.compterParStatut()["confirmed"]).toBe(3);
    });

    it("une image en échec n'empêche jamais les autres entrées (génériques ou images) d'être confirmées", async () => {
      boiteEnvoiRepository.creer("image_produit", "image-echec", { operation: "create", imageId: "image-echec", modeleId: "modele-1", contentBase64: "abc", contentType: "image/png", updatedAt: "x" });
      boiteEnvoiRepository.creer("image_produit", "image-ok", { operation: "create", imageId: "image-ok", modeleId: "modele-1", contentBase64: "abc", contentType: "image/png", updatedAt: "x" });

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, options?: RequestInit) => {
          if (url.includes("/app/images/sync")) {
            const corps = JSON.parse(options!.body as string) as { imageId: string };
            if (corps.imageId === "image-echec") return new Response("erreur serveur", { status: 500 });
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }
          return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
        })
      );

      const service = new SyncService(boiteEnvoiRepository, syncRepository);
      const resultat = await service.executerSynchronisation();

      expect(resultat).toMatchObject({ success: true, push: { envoyees: 2, confirmees: 1 } });
      expect(boiteEnvoiRepository.compterParStatut()).toMatchObject({ confirmed: 1, error: 1 });
    });
  });

  describe("definirImageService — rattrapage des images manquantes (correction 'photos absentes sur poste restauré/secondaire')", () => {
    function reponsePullVide() {
      return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
    }

    it("appelle synchroniserImagesManquantes APRÈS un PULL réussi, avec l'apiUrl/jwt de configuration", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => reponsePullVide()));
      const synchroniserImagesManquantes = vi.fn(async () => ({ telechargees: 0 }));
      const service = new SyncService(boiteEnvoiRepository, syncRepository);
      service.definirImageService({ synchroniserImagesManquantes } as never);

      const resultat = await service.executerSynchronisation();

      expect(resultat.success).toBe(true);
      expect(synchroniserImagesManquantes).toHaveBeenCalledTimes(1);
      expect(synchroniserImagesManquantes).toHaveBeenCalledWith("http://localhost:9999", "jeton-de-test");
    });

    it("un échec du rattrapage d'images ne fait jamais échouer la synchronisation (déjà réussie à ce stade)", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => reponsePullVide()));
      const synchroniserImagesManquantes = vi.fn(async () => {
        throw new Error("panne réseau sur le rattrapage d'images");
      });
      const service = new SyncService(boiteEnvoiRepository, syncRepository);
      service.definirImageService({ synchroniserImagesManquantes } as never);

      const resultat = await service.executerSynchronisation();

      expect(resultat).toMatchObject({ success: true });
    });

    it("sans ImageService défini : synchronisation inchangée (rétrocompatibilité)", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => reponsePullVide()));
      const service = new SyncService(boiteEnvoiRepository, syncRepository);

      const resultat = await service.executerSynchronisation();

      expect(resultat).toMatchObject({ success: true });
    });
  });
});
