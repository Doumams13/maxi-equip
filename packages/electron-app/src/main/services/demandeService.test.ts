import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "../repositories/emplacementRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { NotificationRepository } from "../repositories/notificationRepository.js";
import { DemandeRepository } from "../repositories/demandeRepository.js";
import { StockService } from "./stockService.js";
import { VenteService } from "./venteService.js";
import { DemandeService, DemandeValidationError } from "./demandeService.js";

const CHEMIN_DB = "/tmp/test-demande-integration.sqlite";

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("DemandeService — Phase 4.1 (base SQLite réelle, vrai VenteService)", () => {
  let db: Database.Database;
  let produitId: string;
  let depotId: string;
  let shopId: string;

  beforeAll(() => {
    db = ouvrirBaseDeTest();
    db.prepare(
      "INSERT INTO utilisateurs (id, identifiant, nom, role, password_hash, actif, created_at, updated_at) VALUES ('u1','test','Testeur','administrateur','x',1,?,?)"
    ).run(new Date().toISOString(), new Date().toISOString());

    const emplacementRepository = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacementRepository);
    const emplacements = emplacementRepository.list();
    shopId = emplacements.find((e) => e.estPointDeVente)!.id;
    depotId = emplacements.filter((e) => !e.estPointDeVente)[0]!.id;

    const produitRepository = new ProduitRepository(db);
    produitId = produitRepository.create({
      motif: "Carreau Demande Test",
      type: "carrelage",
      taille: "60x60",
      tailleTri: 60,
      reference: "DEM-TEST-001",
      prix: 12000,
      seuilAlerte: 5,
    });

    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    const stockService = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository);
    stockService.enregistrerEntree(produitId, depotId, 50, "u1");
  });

  afterAll(() => {
    db.close();
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  function construireService(): DemandeService {
    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const factureRepository = new FactureRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    const produitRepository = new ProduitRepository(db);
    const venteService = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository);
    const demandeRepository = new DemandeRepository(db);
    const notificationRepository = new NotificationRepository(db);
    return new DemandeService(demandeRepository, notificationRepository, stockRepository, venteService);
  }

  it("TEST 1/2/3/4 — création d'une demande valide, client obligatoire, email et commentaire facultatifs", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Jean Client",
      clientTelephone: "+241 01 02 03 04",
      clientAdresse: "Libreville, Akébé",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 4, prixIndicatif: 12000 }],
    });

    expect(demande.statut).toBe("nouvelle");
    expect(demande.numero).toMatch(/^DEM-\d{4}-\d{4}$/);
    expect(demande.clientEmail).toBeNull();
    expect(demande.commentaire).toBeNull();
    expect(demande.lignes).toHaveLength(1);
  });

  it("TEST 5 — plusieurs lignes correctement enregistrées, email et commentaire présents quand fournis", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Multi Ligne",
      clientTelephone: "+241 05 06 07 08",
      clientAdresse: "Libreville",
      clientEmail: "client@example.com",
      commentaire: "Livraison urgente si possible",
      lignes: [
        { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 },
        { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 3, prixIndicatif: 12000 },
      ],
    });
    expect(demande.lignes).toHaveLength(2);
    expect(demande.clientEmail).toBe("client@example.com");
    expect(demande.commentaire).toBe("Livraison urgente si possible");
  });

  it("TEST 8 — une nouvelle demande crée réellement une notification associée", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Notif Test",
      clientTelephone: "+241 09 09 09 09",
      clientAdresse: "Akanda",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const notif = db.prepare("SELECT * FROM notifications WHERE demande_id = ?").get(demande.id) as { type: string; lue: number } | undefined;
    expect(notif).toBeDefined();
    expect(notif!.type).toBe("demande");
    expect(notif!.lue).toBe(0);
  });

  it("TEST 10 — modification d'une demande (quantité) avant confirmation", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "A Modifier",
      clientTelephone: "+241 11 11 11 11",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
    });

    const modifiee = service.modifierLignes(demande.id, [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 5, prixIndicatif: 12000 }]);
    expect(modifiee.lignes).toHaveLength(1);
    expect(modifiee.lignes[0]!.quantite).toBe(5);
  });

  it("TEST 11 + Partie 9 — vérification du stock, lecture seule stricte", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Verif Stock",
      clientTelephone: "+241 12 12 12 12",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 10, prixIndicatif: 12000 }],
    });

    const stockAvant = new StockRepository(db).getQuantite(produitId, depotId);
    const verification = service.verifierStock(demande.id);
    const stockApres = new StockRepository(db).getQuantite(produitId, depotId);

    expect(verification).toHaveLength(1);
    expect(verification[0]!.quantiteDemandee).toBe(10);
    expect(verification[0]!.quantiteDisponible).toBeGreaterThanOrEqual(10);
    expect(stockApres).toBe(stockAvant);
  });

  it("TEST 12/13/14/15 + TEST 22 — CONFIRMATION COMPLÈTE : vente, facture, mouvement, traçabilité, stock décrémenté", () => {
    const service = construireService();
    const stockRepository = new StockRepository(db);
    const demande = service.creerDepuisReception({
      clientNom: "Client Confirmation",
      clientTelephone: "+241 13 13 13 13",
      clientAdresse: "Libreville, Akébé",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 6, prixIndicatif: 12000 }],
    });

    const stockAvant = stockRepository.getQuantite(produitId, depotId);

    const resultat = service.confirmer(demande.id, {
      pointDeVenteId: shopId,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "especes",
      lignes: [{ produitId, quantite: 6, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 6 }] }],
    });

    expect(resultat.factureId).toBeDefined();
    expect(resultat.total).toBe(72000);

    const demandeConfirmee = service.obtenir(demande.id)!;
    expect(demandeConfirmee.statut).toBe("confirmee");
    expect(demandeConfirmee.factureId).toBe(resultat.factureId);

    const facture = db.prepare("SELECT vendeur_utilisateur_id FROM factures WHERE id = ?").get(resultat.factureId) as { vendeur_utilisateur_id: string };
    expect(facture.vendeur_utilisateur_id).toBe("u1");

    expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvant - 6);

    const mouvement = db.prepare("SELECT COUNT(*) as n FROM mouvements WHERE facture_id = ?").get(resultat.factureId) as { n: number };
    expect(mouvement.n).toBeGreaterThan(0);
  });

  it("Une demande déjà confirmée ne peut plus être reconfirmée ni modifiée", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Double Confirmation",
      clientTelephone: "+241 14 14 14 14",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    service.confirmer(demande.id, {
      pointDeVenteId: shopId,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: null,
      lignes: [{ produitId, quantite: 1, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 1 }] }],
    });

    expect(() =>
      service.confirmer(demande.id, {
        pointDeVenteId: shopId,
        vendeurUtilisateurId: "u1",
        vendeurCompteConnecteNom: "Testeur",
        vendeurNomManuel: null,
        modeReglement: null,
        lignes: [{ produitId, quantite: 1, prixUnitaire: 12000, allocationsDepots: [] }],
      })
    ).toThrow(DemandeValidationError);

    expect(() => service.modifierLignes(demande.id, [{ produitId, motif: "x", taille: "x", quantite: 1, prixIndicatif: 1 }])).toThrow(DemandeValidationError);
  });

  it("TEST 16 — refus avec motif obligatoire", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "A Refuser",
      clientTelephone: "+241 15 15 15 15",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });

    expect(() => service.refuser(demande.id, "")).toThrow(DemandeValidationError);

    const refusee = service.refuser(demande.id, "Produit indisponible");
    expect(refusee.statut).toBe("refusee");
    expect(refusee.refusMotif).toBe("Produit indisponible");
  });

  it("TEST 17 — annulation, distincte du refus (aucun motif requis)", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "A Annuler",
      clientTelephone: "+241 16 16 16 16",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const annulee = service.annuler(demande.id);
    expect(annulee.statut).toBe("annulee");
    expect(annulee.refusMotif).toBeNull();
  });

  it("TEST 18/19/20 — purge : ancienne non confirmée supprimée définitivement, récente et confirmée conservées", () => {
    const service = construireService();

    const ancienne = service.creerDepuisReception({
      clientNom: "Ancienne Demande",
      clientTelephone: "+241 17 17 17 17",
      clientAdresse: "Libreville",
      commentaire: "Donnée personnelle à purger",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const huitJoursAvant = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE demandes SET created_at = ? WHERE id = ?").run(huitJoursAvant, ancienne.id);

    const recente = service.creerDepuisReception({
      clientNom: "Recente Demande",
      clientTelephone: "+241 18 18 18 18",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });

    const confirmeeAncienne = service.creerDepuisReception({
      clientNom: "Confirmee Ancienne",
      clientTelephone: "+241 19 19 19 19",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    service.confirmer(confirmeeAncienne.id, {
      pointDeVenteId: shopId,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: null,
      lignes: [{ produitId, quantite: 1, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 1 }] }],
    });
    db.prepare("UPDATE demandes SET created_at = ? WHERE id = ?").run(huitJoursAvant, confirmeeAncienne.id);

    const supprimees = service.purgerDemandesAnciennes();

    expect(supprimees).toContain(ancienne.id);
    expect(service.obtenir(ancienne.id)).toBeNull();
    expect(service.obtenir(recente.id)).not.toBeNull();
    expect(service.obtenir(confirmeeAncienne.id)).not.toBeNull();
    expect(service.obtenir(confirmeeAncienne.id)!.statut).toBe("confirmee");
  });
});
