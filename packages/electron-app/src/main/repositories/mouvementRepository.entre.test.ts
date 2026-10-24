import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { MouvementRepository } from "./mouvementRepository.js";

/**
 * Bilan d'activité (2026-10-21) — `sommeQuantiteParTypeEntre` doit borner
 * l'agrégat à une plage de dates LIBRE, contrairement à
 * `sommeQuantiteParType` (toutes périodes confondues) — base réelle,
 * dates insérées directement en SQL pour un contrôle exact (les
 * mouvements créés via les services utilisent toujours `new Date()`,
 * impossible à dater précisément dans un test).
 */
const CHEMIN_DB = join(tmpdir(), "test-mouvement-entre.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("MouvementRepository.sommeQuantiteParTypeEntre — plage de dates libre (base réelle)", () => {
  let db: Database.Database;
  let repository: MouvementRepository;
  const PRODUIT_ID = "produit-test-1";
  const DEPOT_ID = "depot-test-1";

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new MouvementRepository(db);
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES (?, 'Akébé', 'depot', 'Libreville', 0, ?, ?)"
    ).run(DEPOT_ID, maintenant, maintenant);
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, 'X', 'Y', 'Z', 1, 'REF-1', 1000, 0, ?, ?)"
    ).run(PRODUIT_ID, maintenant, maintenant);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  function insererMouvement(type: "entree" | "sortie", quantite: number, date: string): void {
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO mouvements (id, type, produit_id, emplacement_id, quantite, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(`mvt-${Math.random()}`, type, PRODUIT_ID, DEPOT_ID, quantite, date, maintenant, maintenant);
  }

  it("ne compte que les mouvements dont la date tombe DANS la plage, jamais ceux en dehors", () => {
    insererMouvement("entree", 10, "2026-01-05T00:00:00.000Z"); // dans la plage
    insererMouvement("entree", 20, "2026-01-10T00:00:00.000Z"); // dans la plage
    insererMouvement("entree", 999, "2025-12-31T23:59:59.999Z"); // juste AVANT la plage
    insererMouvement("entree", 999, "2026-02-01T00:00:00.000Z"); // juste APRÈS la plage
    insererMouvement("sortie", 5, "2026-01-07T00:00:00.000Z"); // type différent, jamais compté ici

    const total = repository.sommeQuantiteParTypeEntre("entree", "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");
    expect(total).toBe(30);
  });

  it("exclut un mouvement lié à une facture annulée, même dans la plage (même règle que sommeQuantiteParType)", () => {
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'T', 't', 'x', 'administrateur', ?, ?)"
    ).run(maintenant, maintenant);
    db.prepare(
      "INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, remise, statut_paiement, montant_paye, statut_livraison, created_at, updated_at) VALUES ('f1','FAC-1','2026-01-05T00:00:00.000Z',?, 'Client','u1',1000,0,'payee',1000,'en_attente',?,?)"
    ).run(DEPOT_ID, maintenant, maintenant);
    db.prepare("UPDATE factures SET annulee_le = ? WHERE id = 'f1'").run(maintenant);
    db.prepare(
      "INSERT INTO mouvements (id, type, produit_id, emplacement_id, quantite, date, facture_id, created_at, updated_at) VALUES ('mvt-f1', 'sortie', ?, ?, 7, '2026-01-05T00:00:00.000Z', 'f1', ?, ?)"
    ).run(PRODUIT_ID, DEPOT_ID, maintenant, maintenant);

    const total = repository.sommeQuantiteParTypeEntre("sortie", "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");
    expect(total).toBe(0);
  });
});

/**
 * Bilan d'activité — tableau détaillé par produit (2026-10-22) — même
 * principe de base réelle que ci-dessus (dates insérées directement en
 * SQL), pour distinguer "vendu" (sortie liée à une facture) de "sortie"
 * (sortie manuelle, sans facture).
 */
describe("MouvementRepository.detailVenteSortieParProduitEntre — base réelle", () => {
  let db: Database.Database;
  let repository: MouvementRepository;
  const DEPOT_ID = "depot-test-2";
  const PRODUIT_A = "produit-test-a";
  const PRODUIT_B = "produit-test-b";

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new MouvementRepository(db);
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES (?, 'Akébé', 'depot', 'Libreville', 0, ?, ?)"
    ).run(DEPOT_ID, maintenant, maintenant);
    for (const id of [PRODUIT_A, PRODUIT_B]) {
      db.prepare(
        "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, 'X', 'Y', 'Z', 1, ?, 1000, 0, ?, ?)"
      ).run(id, `REF-${id}`, maintenant, maintenant);
    }
    db.prepare(
      "INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'T', 't', 'x', 'administrateur', ?, ?)"
    ).run(maintenant, maintenant);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  function creerFacture(id: string, numero: string, annulee: boolean): void {
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, remise, statut_paiement, montant_paye, statut_livraison, created_at, updated_at) VALUES (?, ?, '2026-01-05T00:00:00.000Z', ?, 'Client', 'u1', 1000, 0, 'payee', 1000, 'en_attente', ?, ?)"
    ).run(id, numero, DEPOT_ID, maintenant, maintenant);
    if (annulee) db.prepare("UPDATE factures SET annulee_le = ? WHERE id = ?").run(maintenant, id);
  }

  function insererMouvement(
    produitId: string,
    type: "entree" | "sortie",
    quantite: number,
    date: string,
    options: { factureId?: string; annuleLe?: string } = {}
  ): string {
    const maintenant = new Date().toISOString();
    const id = `mvt-${Math.random()}`;
    db.prepare(
      "INSERT INTO mouvements (id, type, produit_id, emplacement_id, quantite, date, facture_id, annule_le, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, type, produitId, DEPOT_ID, quantite, date, options.factureId ?? null, options.annuleLe ?? null, maintenant, maintenant);
    return id;
  }

  it("distingue 'vendu' (sortie liée à une facture) de 'sortie' (sortie manuelle, sans facture), par produit", () => {
    creerFacture("f1", "FAC-1", false);
    insererMouvement(PRODUIT_A, "sortie", 7, "2026-01-05T00:00:00.000Z", { factureId: "f1" }); // vendu
    insererMouvement(PRODUIT_A, "sortie", 3, "2026-01-06T00:00:00.000Z"); // sortie manuelle
    insererMouvement(PRODUIT_B, "sortie", 2, "2026-01-07T00:00:00.000Z"); // sortie manuelle, autre produit
    insererMouvement(PRODUIT_A, "entree", 100, "2026-01-05T00:00:00.000Z"); // jamais compté ici (type différent)

    const detail = repository.detailVenteSortieParProduitEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");

    expect(detail.get(PRODUIT_A)).toEqual({ vendu: 7, sortie: 3 });
    expect(detail.get(PRODUIT_B)).toEqual({ vendu: 0, sortie: 2 });
  });

  it("exclut une sortie liée à une facture ANNULÉE du 'vendu', et un mouvement manuel lui-même annulé de la 'sortie' — même règle que sommeQuantiteParTypeEntre", () => {
    creerFacture("f2", "FAC-2", true);
    insererMouvement(PRODUIT_A, "sortie", 7, "2026-01-05T00:00:00.000Z", { factureId: "f2" }); // facture annulée → exclu
    insererMouvement(PRODUIT_A, "sortie", 3, "2026-01-06T00:00:00.000Z", { annuleLe: new Date().toISOString() }); // mouvement manuel annulé → exclu

    const detail = repository.detailVenteSortieParProduitEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");

    expect(detail.get(PRODUIT_A)).toBeUndefined();
  });

  it("ignore les mouvements hors de la plage [debut, fin] et n'inclut jamais un produit totalement sans activité (jamais une ligne à zéro superflue)", () => {
    insererMouvement(PRODUIT_A, "sortie", 5, "2025-12-31T23:59:59.999Z"); // juste avant la plage
    insererMouvement(PRODUIT_A, "sortie", 5, "2026-02-01T00:00:00.000Z"); // juste après la plage

    const detail = repository.detailVenteSortieParProduitEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");

    expect(detail.get(PRODUIT_A)).toBeUndefined();
    expect(detail.get(PRODUIT_B)).toBeUndefined();
    expect(detail.size).toBe(0);
  });
});
