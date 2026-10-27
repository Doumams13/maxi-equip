import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { SyncApplicationService } from "./syncApplicationService.js";

/**
 * Tests réels (vraie base SQLite, vrais repositories) de
 * `SyncApplicationService` — correction "visibilité croisée Factures/
 * Historique entre postes" (2026-10-27), Phase 4. Chaque branche
 * (`creerDepuisServeur`/`appliquerAnnulationDepuisServeur`) est déjà
 * testée en détail dans son propre fichier — ce fichier vérifie
 * uniquement le DISPATCH par `entityType` et le dé-structurage correct
 * du payload JSON (reçu en tant que `unknown`, comme réellement reçu
 * via /v1/sync/pull).
 */
describe("SyncApplicationService.appliquer (base réelle)", () => {
  let db: Database.Database;
  let factureRepository: FactureRepository;
  let mouvementRepository: MouvementRepository;
  let service: SyncApplicationService;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    factureRepository = new FactureRepository(db);
    mouvementRepository = new MouvementRepository(db);
    service = new SyncApplicationService(factureRepository, mouvementRepository);

    const now = new Date().toISOString();
    db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('shop', 'SHOP', 'shop', 'Libreville', 1, ?, ?)").run(now, now);
    db.prepare("INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'Testeur', 'testeur', 'x', 'administrateur', ?, ?)").run(now, now);
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES ('p1', 'X', 'Y', 'Z', 1, 'REF-1', 1000, 0, ?, ?)"
    ).run(now, now);
  });

  afterEach(() => {
    db.close();
  });

  it("'vente' : dé-structure le payload JSON et crée la facture via FactureRepository.creerDepuisServeur", () => {
    const payload = {
      factureId: "f1",
      numero: "FAC-2026-0001",
      date: "2026-01-01T00:00:00.000Z",
      emplacementId: "shop",
      clientNom: "Client",
      clientTelephone: null,
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      total: 10000,
      remise: 0,
      statutPaiement: "payee",
      montantPaye: 10000,
      lignes: [],
      mouvementIds: [],
      identiteSnapshot: null,
    };

    const traitee = service.appliquer("vente", payload);

    expect(traitee).toBe(true);
    expect(factureRepository.findById("f1")).toMatchObject({ numero: "FAC-2026-0001" });
  });

  it("'vente' avec un payload antérieur à la Phase 3 (emplacementId absent) : traitée comme un succès no-op, jamais une boucle de rattrapage infinie", () => {
    const payload = { factureId: "f1", numero: "FAC-2026-0001", total: 10000, lignes: [] };

    const traitee = service.appliquer("vente", payload);

    expect(traitee).toBe(true);
    expect(factureRepository.findById("f1")).toBeNull();
  });

  it("'annulation' : dé-structure le payload JSON et annule la facture déjà connue", () => {
    service.appliquer("vente", {
      factureId: "f1", numero: "FAC-2026-0001", date: "2026-01-01T00:00:00.000Z", emplacementId: "shop", clientNom: "Client",
      clientTelephone: null, clientAdresse: null, vendeurUtilisateurId: "u1", vendeurNomManuel: null, modeReglement: "Espèces",
      total: 10000, remise: 0, statutPaiement: "payee", montantPaye: 10000, lignes: [], mouvementIds: [], identiteSnapshot: null,
    });

    const traitee = service.appliquer("annulation", { factureId: "f1", motifAnnulation: "Erreur", annuleeLe: "2026-02-01T00:00:00.000Z", annuleePar: "u1" });

    expect(traitee).toBe(true);
    expect(factureRepository.findById("f1")).toMatchObject({ annuleeLe: "2026-02-01T00:00:00.000Z", motifAnnulation: "Erreur" });
  });

  it("'entree' : dé-structure le payload JSON et crée le mouvement", () => {
    const traitee = service.appliquer("entree", { mouvementId: "m1", produitId: "p1", emplacementId: "shop", quantite: 25, date: "2026-01-01T00:00:00.000Z", utilisateurId: "u1" });

    expect(traitee).toBe(true);
    expect(mouvementRepository.findById("m1")).toMatchObject({ type: "entree", produitId: "p1", quantite: 25 });
  });

  it("'transfert' : utilise emplacementSourceId/emplacementDestinationId, jamais emplacementId", () => {
    const traitee = service.appliquer("transfert", { mouvementId: "m1", produitId: "p1", emplacementSourceId: "shop", emplacementDestinationId: "shop", quantite: 5, date: "2026-01-01T00:00:00.000Z", utilisateurId: null });

    expect(traitee).toBe(true);
    expect(mouvementRepository.findById("m1")).toMatchObject({ type: "transfert", emplacementId: null });
  });

  it("dépendance pas encore résolvable localement (produit inconnu) : renvoie false, rien d'écrit", () => {
    const traitee = service.appliquer("sortie", { mouvementId: "m1", produitId: "produit-inconnu", emplacementId: "shop", quantite: 5, date: "2026-01-01T00:00:00.000Z", utilisateurId: null });

    expect(traitee).toBe(false);
    expect(mouvementRepository.findById("m1")).toBeNull();
  });
});
