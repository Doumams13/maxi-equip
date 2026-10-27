import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { FactureRepository } from "./factureRepository.js";
import type { LigneFacture } from "@maxi-equip/shared-types";

/**
 * Tests réels (vraie base SQLite) de `creerDepuisServeur`/
 * `appliquerAnnulationDepuisServeur` — correction "visibilité croisée
 * Factures/Historique entre postes" (2026-10-27), Phase 4.
 */
describe("FactureRepository.creerDepuisServeur / appliquerAnnulationDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let repository: FactureRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new FactureRepository(db);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('shop', 'SHOP', 'shop', 'Libreville', 1, ?, ?)").run(now, now);
    db.prepare("INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'Testeur', 'testeur', 'x', 'administrateur', ?, ?)").run(now, now);
  });

  afterEach(() => {
    db.close();
  });

  const ligne: LigneFacture = {
    produitId: null,
    motif: "Marbre Blanc",
    reference: "MB-6060",
    taille: "60x60",
    quantite: 2,
    prixUnitaire: 15000,
    prixUnitaireNormal: null,
    promotionId: null,
    promotionLibelle: null,
    promotionType: null,
    promotionValeur: null,
    surfaceCartonM2: null,
  };

  function factureInput(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "facture-serveur-1",
      numero: "FAC-2026-0099",
      date: "2026-01-01T00:00:00.000Z",
      emplacementId: "shop",
      clientNom: "LATUFOU",
      clientTelephone: null,
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      lignes: [ligne],
      total: 30000,
      remise: 0,
      statutPaiement: "payee" as const,
      montantPaye: 30000,
      identiteSnapshot: null,
      ...overrides,
    };
  }

  describe("creerDepuisServeur", () => {
    it("insère la facture ET ses lignes en conservant EXACTEMENT l'id d'origine", () => {
      const applique = repository.creerDepuisServeur(factureInput());

      expect(applique).toBe(true);
      const facture = repository.findById("facture-serveur-1");
      expect(facture).toMatchObject({ id: "facture-serveur-1", numero: "FAC-2026-0099", clientNom: "LATUFOU", total: 30000 });
      expect(facture!.lignes).toHaveLength(1);
      expect(facture!.lignes[0]).toMatchObject({ reference: "MB-6060", quantite: 2 });
    });

    it("appelé une seconde fois sur le même id : no-op idempotent, renvoie true, jamais de doublon", () => {
      repository.creerDepuisServeur(factureInput());
      const applique = repository.creerDepuisServeur(factureInput({ clientNom: "Nom différent — ne doit jamais écraser" }));

      expect(applique).toBe(true);
      expect(repository.list().filter((f) => f.id === "facture-serveur-1")).toHaveLength(1);
      expect(repository.findById("facture-serveur-1")?.clientNom).toBe("LATUFOU");
    });

    it("emplacement inconnu localement : n'insère rien, renvoie false — retentable au prochain cycle", () => {
      const applique = repository.creerDepuisServeur(factureInput({ emplacementId: "depot-jamais-connu" }));

      expect(applique).toBe(false);
      expect(repository.findById("facture-serveur-1")).toBeNull();
    });

    it("vendeur inconnu localement : n'insère rien, renvoie false — retentable au prochain cycle", () => {
      const applique = repository.creerDepuisServeur(factureInput({ vendeurUtilisateurId: "compte-jamais-connu" }));

      expect(applique).toBe(false);
      expect(repository.findById("facture-serveur-1")).toBeNull();
    });
  });

  describe("appliquerAnnulationDepuisServeur", () => {
    it("facture pas encore connue localement : ne fait rien, traitee = false (à retenter)", () => {
      const resultat = repository.appliquerAnnulationDepuisServeur({ factureId: "facture-jamais-recue", motif: "Erreur", annuleePar: "u1", annuleeLe: "2026-02-01T00:00:00.000Z" });

      expect(resultat).toEqual({ traitee: false });
    });

    it("facture connue, pas encore annulée : applique avec le timestamp D'ORIGINE (jamais 'maintenant')", () => {
      repository.creerDepuisServeur(factureInput());

      const resultat = repository.appliquerAnnulationDepuisServeur({ factureId: "facture-serveur-1", motif: "Erreur de saisie", annuleePar: "u1", annuleeLe: "2026-02-01T00:00:00.000Z" });

      expect(resultat).toEqual({ traitee: true });
      const facture = repository.findById("facture-serveur-1");
      expect(facture).toMatchObject({ annuleeLe: "2026-02-01T00:00:00.000Z", annuleePar: "u1", motifAnnulation: "Erreur de saisie" });
    });

    it("déjà annulée (écho de sa propre machine, ou second passage du balayage) : ne touche rien, traitee = true (plus rien à faire)", () => {
      repository.creerDepuisServeur(factureInput());
      repository.annuler("facture-serveur-1", "Première annulation", "u1");
      const avant = repository.findById("facture-serveur-1");

      const resultat = repository.appliquerAnnulationDepuisServeur({ factureId: "facture-serveur-1", motif: "Tentative différente", annuleePar: "u1", annuleeLe: "2026-03-01T00:00:00.000Z" });

      expect(resultat).toEqual({ traitee: true });
      const apres = repository.findById("facture-serveur-1");
      expect(apres?.motifAnnulation).toBe(avant?.motifAnnulation); // inchangé, jamais écrasé
    });
  });
});
