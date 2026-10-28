import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { NotificationRepository } from "./notificationRepository.js";

/**
 * Tests réels (vraie base SQLite) — système multiposte fiable
 * (2026-10-28), Phase E. Vérifie en particulier que la migration
 * `elargirTypeNotificationsEtAjouterOrigineSiAbsent` (voir migrate.ts)
 * a réellement élargi le CHECK et ajouté les colonnes attendues, pas
 * seulement relu dans le code.
 */
describe("NotificationRepository (base réelle)", () => {
  let db: Database.Database;
  let repository: NotificationRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new NotificationRepository(db);

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO demandes (id, numero, statut, client_nom, client_telephone, client_adresse, created_at, updated_at) VALUES ('demande-1', 'DEM-1', 'nouvelle', 'Client X', '0600000000', 'Adresse', ?, ?)"
    ).run(now, now);
  });

  afterEach(() => {
    db.close();
  });

  it("creer('demande', ...) préserve le comportement historique — demandeId renseigné, origine absente", () => {
    const n = repository.creer("demande", "Nouvelle demande", "Client X — 2 article(s)", "demande-1");

    expect(n).toMatchObject({ type: "demande", demandeId: "demande-1", entityType: null, entityId: null, posteId: null, lue: false });
  });

  it("creer('vente', ..., origine) renseigne entityType/entityId/posteId, jamais demandeId", () => {
    const n = repository.creer("vente", "Nouvelle vente", "Facture FAC-1 — 2× Marbre Blanc (60x60)", null, {
      entityType: "vente",
      entityId: "facture-1",
      posteId: "poste-pcx-1",
    });

    expect(n).toMatchObject({ type: "vente", demandeId: null, entityType: "vente", entityId: "facture-1", posteId: "poste-pcx-1" });
  });

  it("les 4 nouveaux types (vente/entree/sortie/transfert) sont acceptés par la contrainte élargie — plus de CHECK figé à l'ancien ensemble", () => {
    for (const type of ["vente", "entree", "sortie", "transfert"] as const) {
      expect(() => repository.creer(type, `Titre ${type}`, `Message ${type}`, null, { entityType: type, entityId: "x", posteId: "p1" })).not.toThrow();
    }
  });

  it("findById relit correctement les nouvelles colonnes", () => {
    const n = repository.creer("entree", "Entrée", "+5 Marbre Blanc — Akébé", null, { entityType: "entree", entityId: "mvt-1", posteId: "poste-2" });

    const relue = repository.findById(n.id);
    expect(relue).toMatchObject({ entityType: "entree", entityId: "mvt-1", posteId: "poste-2" });
  });

  it("listerRecentes/compterNonLues/marquerLue continuent de fonctionner sans distinction de type", () => {
    repository.creer("demande", "D", "d", "demande-1");
    repository.creer("vente", "V", "v", null, { entityType: "vente", entityId: "f1", posteId: null });

    expect(repository.compterNonLues()).toBe(2);
    const liste = repository.listerRecentes();
    expect(liste).toHaveLength(2);

    repository.marquerLue(liste[0]!.id);
    expect(repository.compterNonLues()).toBe(1);
  });
});
