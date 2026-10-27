import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { SyncRepository } from "./syncRepository.js";

/**
 * Tests réels (vraie base SQLite) de `marquerApplique`/`listerNonAppliquees`
 * — correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27), Phase 4. `enregistrerOperationsRecues`/`getDernierCurseur`
 * sont déjà couverts ailleurs (tests d'intégration SyncService) — non
 * dupliqués ici.
 */
describe("SyncRepository — suivi applique/listerNonAppliquees (base réelle)", () => {
  let db: Database.Database;
  let repository: SyncRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new SyncRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("une opération fraîchement reçue est NON appliquée par défaut (applique = 0)", () => {
    repository.enregistrerOperationsRecues([{ entityType: "vente", entityId: "v1", payload: { x: 1 }, curseurServeur: 10 }]);

    const nonAppliquees = repository.listerNonAppliquees(["vente"]);
    expect(nonAppliquees).toHaveLength(1);
    expect(nonAppliquees[0]).toMatchObject({ curseurServeur: 10, entityType: "vente", entityId: "v1", payload: { x: 1 } });
  });

  it("marquerApplique retire l'opération de listerNonAppliquees", () => {
    repository.enregistrerOperationsRecues([{ entityType: "vente", entityId: "v1", payload: {}, curseurServeur: 10 }]);
    repository.marquerApplique(10);

    expect(repository.listerNonAppliquees(["vente"])).toEqual([]);
  });

  it("filtre par entityType — n'inclut jamais 'demande' (type déjà traité par un autre chemin)", () => {
    repository.enregistrerOperationsRecues([
      { entityType: "vente", entityId: "v1", payload: {}, curseurServeur: 10 },
      { entityType: "demande", entityId: "d1", payload: {}, curseurServeur: 11 },
    ]);

    const nonAppliquees = repository.listerNonAppliquees(["vente", "annulation", "entree", "sortie", "transfert"]);
    expect(nonAppliquees).toHaveLength(1);
    expect(nonAppliquees[0]!.entityType).toBe("vente");
  });

  it("ordonne par curseur croissant — applique les plus anciennes en premier", () => {
    repository.enregistrerOperationsRecues([
      { entityType: "entree", entityId: "e1", payload: {}, curseurServeur: 20 },
      { entityType: "entree", entityId: "e2", payload: {}, curseurServeur: 5 },
    ]);

    const nonAppliquees = repository.listerNonAppliquees(["entree"]);
    expect(nonAppliquees.map((o) => o.curseurServeur)).toEqual([5, 20]);
  });

  it("entityTypes vide : renvoie un tableau vide, jamais une requête malformée", () => {
    expect(repository.listerNonAppliquees([])).toEqual([]);
  });
});
