import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { MouvementRepository } from "./mouvementRepository.js";

/**
 * Tests réels (vraie base SQLite) de `creerDepuisServeur` — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * Phase 4.
 */
describe("MouvementRepository.creerDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let repository: MouvementRepository;
  const PRODUIT = "produit-1";
  const DEPOT_A = "depot-a";
  const DEPOT_B = "depot-b";

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new MouvementRepository(db);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES (?, 'Akébé', 'depot', 'Libreville', 0, ?, ?)").run(DEPOT_A, now, now);
    db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES (?, 'Akanda', 'depot', 'Libreville', 0, ?, ?)").run(DEPOT_B, now, now);
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, 'X', 'Y', 'Z', 1, 'REF-1', 1000, 0, ?, ?)"
    ).run(PRODUIT, now, now);
  });

  afterEach(() => {
    db.close();
  });

  it("insère une entrée en conservant EXACTEMENT l'id d'origine", () => {
    const applique = repository.creerDepuisServeur({
      id: "mouvement-serveur-1",
      type: "entree",
      produitId: PRODUIT,
      emplacementId: DEPOT_A,
      emplacementSourceId: null,
      emplacementDestinationId: null,
      quantite: 50,
      date: "2026-01-01T00:00:00.000Z",
      utilisateurId: null,
    });

    expect(applique).toBe(true);
    const mouvement = repository.findById("mouvement-serveur-1");
    expect(mouvement).toMatchObject({ id: "mouvement-serveur-1", type: "entree", produitId: PRODUIT, emplacementId: DEPOT_A, quantite: 50, factureId: null });
  });

  it("insère un transfert avec source ET destination", () => {
    const applique = repository.creerDepuisServeur({
      id: "mouvement-serveur-2",
      type: "transfert",
      produitId: PRODUIT,
      emplacementId: null,
      emplacementSourceId: DEPOT_A,
      emplacementDestinationId: DEPOT_B,
      quantite: 10,
      date: "2026-01-01T00:00:00.000Z",
      utilisateurId: null,
    });

    expect(applique).toBe(true);
    const mouvement = repository.findById("mouvement-serveur-2");
    expect(mouvement).toMatchObject({ type: "transfert", emplacementSourceId: DEPOT_A, emplacementDestinationId: DEPOT_B });
  });

  it("appelé une seconde fois sur le même id : no-op idempotent, renvoie true, jamais de doublon", () => {
    const input = { id: "mouvement-serveur-1", type: "entree" as const, produitId: PRODUIT, emplacementId: DEPOT_A, emplacementSourceId: null, emplacementDestinationId: null, quantite: 50, date: "2026-01-01T00:00:00.000Z", utilisateurId: null };
    repository.creerDepuisServeur(input);
    const applique = repository.creerDepuisServeur({ ...input, quantite: 999 });

    expect(applique).toBe(true);
    expect(repository.findById("mouvement-serveur-1")?.quantite).toBe(50); // inchangé, jamais écrasé
  });

  it("produit inconnu localement : n'insère rien, renvoie false — retentable au prochain cycle", () => {
    const applique = repository.creerDepuisServeur({
      id: "mouvement-serveur-1",
      type: "entree",
      produitId: "produit-jamais-connu",
      emplacementId: DEPOT_A,
      emplacementSourceId: null,
      emplacementDestinationId: null,
      quantite: 50,
      date: "2026-01-01T00:00:00.000Z",
      utilisateurId: null,
    });

    expect(applique).toBe(false);
    expect(repository.findById("mouvement-serveur-1")).toBeNull();
  });
});
