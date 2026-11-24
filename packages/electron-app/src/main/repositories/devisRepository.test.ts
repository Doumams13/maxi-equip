import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { DevisRepository } from "./devisRepository.js";

/**
 * Devis pro-forma (correction "ajouter les devis pro-forma", 2026-11-13)
 * — base réelle (`:memory:`), jamais mockée, même principe que
 * stockRepository.test.ts.
 */
describe("DevisRepository — base réelle", () => {
  let db: Database.Database;
  let repository: DevisRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repository = new DevisRepository(db);
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO produits (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, created_at, updated_at) VALUES ('p1', 'Marbre Blanc', 'Faïence', '60x60', 60, 'MB-6060', 10000, 0, ?, ?)"
    ).run(maintenant, maintenant);
  });

  function nouveauDevis(overrides: Partial<Parameters<DevisRepository["creer"]>[0]> = {}) {
    return repository.creer({
      clientNom: "Client Test",
      clientTelephone: "077000001",
      clientAdresse: "Akanda",
      modeReglement: "Espèces",
      total: 50000,
      remise: 0,
      lignes: [{ produitId: "p1", motif: "Marbre Blanc", reference: "MB-6060", taille: "60x60", quantite: 5, prixUnitaire: 10000 }],
      ...overrides,
    });
  }

  it("crée un devis en statut 'brouillon', avec un numéro séquentiel DEV-<année>-NNNN", () => {
    const d1 = nouveauDevis();
    const d2 = nouveauDevis();

    expect(d1.statut).toBe("brouillon");
    expect(d1.factureId).toBeNull();
    expect(d1.lignes).toHaveLength(1);
    expect(d1.lignes[0]).toMatchObject({ produitId: "p1", motif: "Marbre Blanc", reference: "MB-6060", taille: "60x60", quantite: 5, prixUnitaire: 10000, remisePourcent: 0, espace: null });

    const anneeCourante = new Date().getFullYear();
    expect(d1.numero).toBe(`DEV-${anneeCourante}-0001`);
    expect(d2.numero).toBe(`DEV-${anneeCourante}-0002`);
  });

  it("findById renvoie null pour un identifiant inexistant", () => {
    expect(repository.findById("inexistant")).toBeNull();
  });

  it("listerToutes renvoie les devis les plus récents en premier", () => {
    const d1 = nouveauDevis();
    const d2 = nouveauDevis();

    const liste = repository.listerToutes();
    expect(liste.map((d) => d.id)).toEqual([d2.id, d1.id]);
  });

  it("marquerConvertie bascule le statut en 'convertie' et renseigne factureId — jamais une seconde fois réalisable (vérifié côté IPC, voir devis.ts)", () => {
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('shop', 'SHOP', 'shop', 'Libreville', 1, ?, ?)"
    ).run(maintenant, maintenant);
    db.prepare(
      "INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'Testeur', 'testeur', 'x', 'administrateur', ?, ?)"
    ).run(maintenant, maintenant);
    db.prepare(
      "INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, statut_paiement, montant_paye, statut_livraison, created_at, updated_at) VALUES ('facture-123', 'FAC-1', ?, 'shop', 'Client', 'u1', 50000, 'payee', 50000, 'en_attente', ?, ?)"
    ).run(maintenant, maintenant, maintenant);

    const d = nouveauDevis();
    repository.marquerConvertie(d.id, "facture-123");

    const relu = repository.findById(d.id)!;
    expect(relu.statut).toBe("convertie");
    expect(relu.factureId).toBe("facture-123");
  });

  it("annuler bascule le statut en 'annulee', sans toucher factureId", () => {
    const d = nouveauDevis();
    repository.annuler(d.id);

    const relu = repository.findById(d.id)!;
    expect(relu.statut).toBe("annulee");
    expect(relu.factureId).toBeNull();
  });

  it("proforma (2026-11-24) : remises par ligne et remise globale recalculées ici, jamais reprises de l'appelant ; modification d'un brouillon", () => {
    const d = repository.creer({
      clientNom: "",
      objet: "Fourniture de carrelage",
      notes: "Hypothèses…",
      total: 1, // ignoré
      remise: 1, // ignoré
      remiseGlobale: 942,
      lignes: [
        { produitId: "p1", motif: "Marbre Blanc", reference: "MB-6060", taille: "30 × 30", quantite: 10, prixUnitaire: 8415, espace: "Terrasse avant", surfaceM2: 13.78, remisePourcent: 5, uniteVente: "carton", surfaceCartonM2: 1.53 },
        { produitId: "p1", motif: "Ciment-colle", reference: "CC-20", taille: "Sac 20 kg", quantite: 105, prixUnitaire: 4500, espace: "Ensemble du chantier", remisePourcent: 0, uniteVente: "sac" },
      ],
    });
    expect(d.total).toBe(84150 + 472500);
    expect(d.remise).toBe(4208 + 942);
    expect(d.remiseGlobale).toBe(942);
    expect(d.objet).toBe("Fourniture de carrelage");
    expect(d.lignes.map((l) => l.espace)).toEqual(["Terrasse avant", "Ensemble du chantier"]);
    expect(d.lignes[0]).toMatchObject({ surfaceM2: 13.78, remisePourcent: 5, uniteVente: "carton", surfaceCartonM2: 1.53 });

    const modifie = repository.modifier(d.id, { clientNom: "M. Test", remiseGlobale: 0, lignes: [d.lignes[1]!] });
    expect(modifie.numero).toBe(d.numero);
    expect(modifie.clientNom).toBe("M. Test");
    expect(modifie.lignes).toHaveLength(1);
    expect(modifie.total).toBe(472500);
    expect(modifie.remise).toBe(0);
  });
});
