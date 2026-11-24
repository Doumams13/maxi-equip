import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ProduitRepository } from "./produitRepository.js";
import { FactureRepository } from "./factureRepository.js";

/**
 * Bilan par catégorie (point 5, 2026-11-24) — requêtes sur une vraie base
 * SQLite migrée : classement produit → modèle → sous-catégorie →
 * catégorie, et lignes vendues sur une période (factures annulées exclues).
 */
describe("bilan par catégorie — requêtes réelles", () => {
  let db: Database.Database;
  const maintenant = "2026-11-20T10:00:00.000Z";

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const carreaux = db.prepare("SELECT sc.id, sc.categorie_id as categorieId FROM sous_categories sc WHERE sc.nom = 'Carreaux'").get() as { id: string; categorieId: string };
    const ciment = db.prepare("SELECT id FROM sous_categories WHERE nom = 'Ciment'").get() as { id: string };
    db.prepare("INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, created_at, updated_at) VALUES ('m1', 'Marbre', 'Grès', ?, ?, ?)").run(carreaux.id, maintenant, maintenant);
    db.prepare("INSERT INTO modeles_produit (id, motif, type, sous_categorie_id, created_at, updated_at) VALUES ('m2', 'Ciment CPJ', 'Portland', ?, ?, ?)").run(ciment.id, maintenant, maintenant);
    const insererProduit = db.prepare(
      "INSERT INTO produits (id, modele_id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES (?, ?, ?, 'x', 'T', 0, ?, 1000, 0, ?, ?)"
    );
    insererProduit.run("p1", "m1", "Marbre", "MB-6060", maintenant, maintenant);
    insererProduit.run("p2", "m2", "Ciment CPJ", "CIM-50", maintenant, maintenant);
    insererProduit.run("p3", null, "Orphelin", "ORP-1", maintenant, maintenant);
    db.prepare("INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('shop', 'SHOP', 'shop', 'Libreville', 1, ?, ?)").run(maintenant, maintenant);
    db.prepare("INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'T', 't', 'x', 'administrateur', ?, ?)").run(maintenant, maintenant);
    const insererFacture = db.prepare(
      "INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, statut_paiement, montant_paye, statut_livraison, annulee_le, created_at, updated_at) VALUES (?, ?, ?, 'shop', 'C', 'u1', 0, 'payee', 0, 'en_attente', ?, ?, ?)"
    );
    insererFacture.run("f1", "FAC-1", maintenant, null, maintenant, maintenant);
    insererFacture.run("f2", "FAC-2", maintenant, maintenant, maintenant, maintenant); // annulée
    insererFacture.run("f3", "FAC-3", "2026-10-01T10:00:00.000Z", null, maintenant, maintenant); // hors période
    const insererLigne = db.prepare("INSERT INTO lignes_facture (id, facture_id, produit_id, motif, reference, taille, quantite, prix_unitaire, unite_vente) VALUES (?, ?, ?, 'M', ?, 'T', ?, ?, ?)");
    insererLigne.run("l1", "f1", "p1", "MB-6060", 10, 12960, "carton");
    insererLigne.run("l2", "f1", "p2", "CIM-50", 20, 4500, "sac");
    insererLigne.run("l3", "f2", "p1", "MB-6060", 99, 1, "carton");
    insererLigne.run("l4", "f3", "p1", "MB-6060", 99, 1, "carton");
  });

  it("classementCatalogue : catégorie/sous-catégorie et nature carreau ; produit sans modèle non classé", () => {
    const c = new Map(new ProduitRepository(db).classementCatalogue().map((x) => [x.produitId, x]));
    expect(c.get("p1")).toMatchObject({ categorieNom: "Carrelage et revêtements", sousCategorieNom: "Carreaux", estCarreau: true });
    expect(c.get("p2")).toMatchObject({ categorieNom: "Matériaux de construction", sousCategorieNom: "Ciment", estCarreau: false });
    expect(c.get("p3")).toMatchObject({ categorieId: null, sousCategorieId: null, estCarreau: false });
  });

  it("lignesVenduesEntre : uniquement les factures actives de la période", () => {
    const lignes = new FactureRepository(db).lignesVenduesEntre("2026-11-01T00:00:00.000Z", "2026-11-30T23:59:59.999Z");
    expect(lignes.map((l) => l.produitId).sort()).toEqual(["p1", "p2"]);
    expect(lignes.find((l) => l.produitId === "p2")).toMatchObject({ quantite: 20, prixUnitaire: 4500, uniteVente: "sac", factureId: "f1" });
  });
});
