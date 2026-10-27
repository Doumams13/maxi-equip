import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { MouvementRepository } from "./mouvementRepository.js";

/**
 * Tests réels (vraie base SQLite) de `listEvenementsPagine` — correction
 * "recherche Historique par référence produit" (2026-10-27). Le champ de
 * recherche affichait "N° facture, client, produit…" mais ne cherchait en
 * réalité que sur le motif/la taille, jamais sur la référence (ex.
 * "YMG44057C") pourtant l'identifiant principal affiché partout ailleurs
 * dans l'app.
 */
describe("MouvementRepository.listEvenementsPagine — recherche par référence produit (base réelle)", () => {
  let db: Database.Database;
  let repository: MouvementRepository;
  const PRODUIT_ID = "produit-test-1";
  const DEPOT_ID = "depot-test-1";

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES (?, 'Akanda', 'depot', 'Libreville', 0, ?, ?)"
    ).run(DEPOT_ID, maintenant, maintenant);
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, 'Nuances bleues', 'Y', '40x40', 1, 'YMG44057C', 1000, 0, ?, ?)"
    ).run(PRODUIT_ID, maintenant, maintenant);
    db.prepare(
      "INSERT INTO mouvements (id, type, produit_id, emplacement_id, quantite, date, created_at, updated_at) VALUES ('mvt-1', 'entree', ?, ?, 100, ?, ?, ?)"
    ).run(PRODUIT_ID, DEPOT_ID, maintenant, maintenant, maintenant);
    repository = new MouvementRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function rechercher(recherche: string) {
    return repository.listEvenementsPagine({
      recherche,
      typeFiltre: "tous",
      dateDebutIso: null,
      dateFinIso: null,
      colonneTri: null,
      direction: "desc",
      page: 1,
      tailleParPage: 20,
    });
  }

  it("trouve un mouvement par la RÉFÉRENCE du produit (ex. 'YMG44057C') — jusqu'ici invisible, seuls motif/taille étaient cherchés", () => {
    const resultat = rechercher("YMG44057C");
    expect(resultat.totalResultats).toBe(1);
    expect(resultat.resultats[0]).toMatchObject({ produitReference: "YMG44057C" });
  });

  it("une recherche partielle (casse/sous-chaîne) sur la référence trouve aussi le mouvement", () => {
    const resultat = rechercher("ymg440");
    expect(resultat.totalResultats).toBe(1);
  });

  it("continue de trouver par motif, inchangé", () => {
    const resultat = rechercher("Nuances");
    expect(resultat.totalResultats).toBe(1);
  });

  it("une référence qui ne correspond à rien renvoie un résultat vide", () => {
    const resultat = rechercher("REFERENCE-INCONNUE");
    expect(resultat.totalResultats).toBe(0);
  });
});
