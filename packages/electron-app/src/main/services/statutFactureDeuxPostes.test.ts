import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "../repositories/syncRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { SyncService } from "./syncService.js";
import { SyncApplicationService } from "./syncApplicationService.js";
import { VenteService } from "./venteService.js";
// Le VRAI serveur de synchronisation (routes /v1/sync/push et /v1/sync/pull, stockage SQLite en mémoire).
import { createRouter } from "../../../../api/src/index.js";
import { initialiserStockageServeur, fermerStockageServeur } from "../../../../api/src/core/storeServeur.js";
import { signerJwt } from "../../../../api/src/core/jwt.js";
import { reinitialiserLimitationPourTests } from "../../../../api/src/core/rateLimiter.js";

/**
 * 0.12.8 (2026-11-27) — synchronisation des statuts de facture, simulée
 * avec DEUX postes réels (bases SQLite distinctes, vrais services) reliés
 * au VRAI serveur de synchronisation : seul le transport HTTP est
 * remplacé (fetch → router.dispatch).
 */

const SECRET = "secret-test-statut-facture";
const FACTURE = "f-yacine";

function ouvrirPoste() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  const now = "2026-11-27T10:00:00.000Z";
  db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('shop', 'SHOP', 'shop', 'Libreville', 1, ?, ?)").run(now, now);
  db.prepare("INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'Testeur', 'testeur', 'x', 'administrateur', ?, ?)").run(now, now);
  const factures = new FactureRepository(db);
  const mouvements = new MouvementRepository(db);
  const boite = new BoiteEnvoiRepository(db);
  const sync = new SyncService(boite, new SyncRepository(db));
  sync.definirApplicationOperationsMetier(new SyncApplicationService(factures, mouvements));
  const ventes = new VenteService(db, new ProduitRepository(db), new StockRepository(db), mouvements, factures, boite);
  return { db, factures, boite, sync, ventes };
}

/** La même facture, déjà synchronisée sur les deux postes (comme avant la 0.12.8). */
function factureDejaSynchronisee(poste: ReturnType<typeof ouvrirPoste>, statutPaiement: "payee" | "reservation", montantPaye: number) {
  poste.factures.creerDepuisServeur({
    id: FACTURE,
    numero: "FAC-2026-0224",
    date: "2026-11-27T16:03:59.509Z",
    emplacementId: "shop",
    clientNom: "YACINE",
    clientTelephone: null,
    clientAdresse: null,
    vendeurUtilisateurId: "u1",
    vendeurNomManuel: null,
    modeReglement: "Espèces",
    lignes: [],
    total: 50000,
    remise: 0,
    statutPaiement,
    montantPaye,
    identiteSnapshot: null,
  });
}

/** Simule une base créée AVANT la 0.12.8 puis mise à jour : la migration ajoute la colonne et prépare le rattrapage. */
function mettreAJourVers0128(poste: ReturnType<typeof ouvrirPoste>) {
  poste.db.exec("ALTER TABLE factures DROP COLUMN statut_modifie_le");
  runMigrations(poste.db);
}

function statut(poste: ReturnType<typeof ouvrirPoste>) {
  const f = poste.factures.findById(FACTURE)!;
  return { statutPaiement: f.statutPaiement, montantPaye: f.montantPaye, statutLivraison: f.statutLivraison };
}

describe("Statut de facture entre deux postes, via le vrai serveur de synchronisation (0.12.8)", () => {
  let shop: ReturnType<typeof ouvrirPoste>;
  let renams: ReturnType<typeof ouvrirPoste>;

  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET;
    process.env["MAXI_EQUIP_ENV"] = "test";
    initialiserStockageServeur(":memory:");
    reinitialiserLimitationPourTests();
    const router = createRouter();
    process.env["MAXI_EQUIP_API_URL"] = "https://api.test";
    process.env["MAXI_EQUIP_SYNC_JWT"] = signerJwt({ sub: "poste-test", role: "app" }, SECRET, 3600);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = new URL(url);
        if (!u.pathname.startsWith("/v1/sync/")) return Response.json({}, { status: 404 });
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
        const res = await router.dispatch({
          method: init?.method ?? "GET",
          path: u.pathname,
          headers,
          query: Object.fromEntries(u.searchParams),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return Response.json(res.body, { status: res.status });
      })
    );
    shop = ouvrirPoste();
    renams = ouvrirPoste();
  });

  afterEach(() => {
    shop.db.close();
    renams.db.close();
    fermerStockageServeur();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const k of ["JWT_SIGNING_SECRET", "MAXI_EQUIP_ENV", "MAXI_EQUIP_API_URL", "MAXI_EQUIP_SYNC_JWT"]) delete process.env[k];
  });

  it("« Payé livré » sur le PC Shop apparaît sur PC-Renams ; un retour en « non livré » fait ensuite sur Renams revient au Shop (le plus récent gagne)", async () => {
    factureDejaSynchronisee(shop, "payee", 50000);
    factureDejaSynchronisee(renams, "payee", 50000);

    shop.ventes.changerStatutFacture(FACTURE, "payee_livree");
    expect((await shop.sync.executerSynchronisation()).success).toBe(true);
    expect((await renams.sync.executerSynchronisation()).success).toBe(true);
    expect(statut(renams)).toEqual({ statutPaiement: "payee", montantPaye: 50000, statutLivraison: "livree" });

    await new Promise((r) => setTimeout(r, 5));
    renams.ventes.changerStatutFacture(FACTURE, "payee_non_livree");
    await renams.sync.executerSynchronisation();
    await shop.sync.executerSynchronisation();
    expect(statut(shop).statutLivraison).toBe("en_attente");
    // Le Shop ne réapplique jamais son propre ancien changement par-dessus le plus récent.
    await shop.sync.executerSynchronisation();
    expect(statut(shop).statutLivraison).toBe("en_attente");
    expect(statut(renams).statutLivraison).toBe("en_attente");
  });

  it("réservation soldée sur le Shop : Renams n'affiche plus de reste à payer", async () => {
    factureDejaSynchronisee(shop, "reservation", 10000);
    factureDejaSynchronisee(renams, "reservation", 10000);

    shop.ventes.changerStatutFacture(FACTURE, "payee_non_livree");
    await shop.sync.executerSynchronisation();
    await renams.sync.executerSynchronisation();
    expect(statut(renams)).toEqual({ statutPaiement: "payee", montantPaye: 50000, statutLivraison: "en_attente" });
  });

  it("rattrapage à la mise à jour : les statuts déjà faux sur Renams se corrigent, et la copie en retard de Renams n'écrase jamais celle du Shop", async () => {
    // État réel du 27/11 : YACINE « payé livré » sur le Shop, « payé non livré » sur Renams ; une réservation soldée sur le Shop seulement.
    factureDejaSynchronisee(shop, "payee", 50000);
    factureDejaSynchronisee(renams, "payee", 50000);
    shop.factures.changerStatut(FACTURE, { statutPaiement: "payee", montantPaye: 50000, statutLivraison: "livree" });

    // Les deux postes passent en 0.12.8 : chacun prépare son rattrapage (Renams envoie aussi sa copie en retard).
    mettreAJourVers0128(shop);
    mettreAJourVers0128(renams);
    expect(shop.boite.listerPretesPourEnvoi().filter((e) => e.entityType === "statut_facture")).toHaveLength(1);

    // Ordre défavorable : Renams pousse sa copie en retard EN PREMIER.
    await renams.sync.executerSynchronisation();
    await shop.sync.executerSynchronisation();
    await renams.sync.executerSynchronisation();

    expect(statut(renams).statutLivraison).toBe("livree");
    expect(statut(shop).statutLivraison).toBe("livree");
    // Une seconde exécution de la migration ne renvoie rien (rattrapage unique).
    runMigrations(shop.db);
    expect(shop.boite.listerPretesPourEnvoi().filter((e) => e.entityType === "statut_facture")).toHaveLength(0);
  });

  it("plus de 500 opérations en attente (au-delà de la limite d'un lot serveur) : tout part quand même, par lots", async () => {
    for (let i = 0; i < 620; i++) {
      shop.boite.creer("statut_facture", crypto.randomUUID(), {
        factureId: `inconnue-${i}`,
        statutPaiement: "payee",
        montantPaye: 1,
        statutLivraison: "livree",
        modifieLe: "2026-11-27T10:00:00.000Z",
        rattrapage: true,
      });
    }
    const resultat = await shop.sync.executerSynchronisation();
    expect(resultat.success).toBe(true);
    expect(shop.boite.listerPretesPourEnvoi()).toHaveLength(0);
    // Côté réception, une facture inconnue en rattrapage est ignorée, jamais retentée indéfiniment.
    await renams.sync.executerSynchronisation();
    expect(renams.db.prepare("SELECT COUNT(*) n FROM sync_recu WHERE entity_type = 'statut_facture' AND applique = 0").get()).toEqual({ n: 0 });
  }, 30_000);
});
