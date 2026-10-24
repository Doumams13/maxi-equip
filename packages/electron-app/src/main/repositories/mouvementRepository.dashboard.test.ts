import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ProduitRepository } from "./produitRepository.js";
import { StockRepository } from "./stockRepository.js";
import { MouvementRepository } from "./mouvementRepository.js";
import { FactureRepository } from "./factureRepository.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "./emplacementRepository.js";
import { BoiteEnvoiRepository } from "./boiteEnvoiRepository.js";
import { StockService, StockValidationError } from "../services/stockService.js";
import { VenteService } from "../services/venteService.js";
import { stock as domainStock } from "@maxi-equip/domain";

/**
 * Correction "entrées/sorties gonflées par les annulations" — base
 * SQLite réelle (même principe que __boiteEnvoi.integration.test.ts),
 * jamais des repositories mockés : la régression concerne directement
 * une requête SQL (le JOIN d'exclusion), seul un vrai moteur SQLite peut
 * la vérifier honnêtement.
 */
const CHEMIN_DB = join(tmpdir(), "test-mouvement-dashboard.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("MouvementRepository — totaux entrées/sorties du tableau de bord, base réelle", async () => {
  let db: Database.Database;
  let produitId: string;
  let depotId: string;
  let depot2Id: string;
  let shopId: string;
  let mouvementRepository: MouvementRepository;
  let stockRepository: StockRepository;
  let venteService: VenteService;
  let stockService: StockService;

  beforeAll(async () => {
    db = ouvrirBaseDeTest();
    db.prepare(
      "INSERT INTO utilisateurs (id, identifiant, nom, role, password_hash, actif, created_at, updated_at) VALUES ('u1','test','Testeur','administrateur','x',1,?,?)"
    ).run(new Date().toISOString(), new Date().toISOString());

    const emplacementRepository = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacementRepository);
    const emplacements = emplacementRepository.list();
    shopId = emplacements.find((e) => e.estPointDeVente)!.id;
    const depots = emplacements.filter((e) => !e.estPointDeVente);
    depotId = depots[0]!.id;
    depot2Id = depots[1]!.id;

    const produitRepository = new ProduitRepository(db);
    produitId = produitRepository.create({
      motif: "Carreau Dashboard",
      type: "carrelage",
      taille: "60x60",
      tailleTri: 60,
      reference: "DASH-001",
      prix: 10000,
      seuilAlerte: 5,
    });

    stockRepository = new StockRepository(db);
    mouvementRepository = new MouvementRepository(db);
    const factureRepository = new FactureRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    stockService = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository);
    venteService = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository);
  });

  afterAll(async () => {
    db.close();
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("une vente ANNULÉE ne compte plus ni dans le total entrées ni dans le total sorties", async () => {
    // Avant toute opération liée à l'annulation : totaux de référence.
    const entreesAvant = mouvementRepository.sommeQuantiteParType("entree");
    const sortiesAvant = mouvementRepository.sommeQuantiteParType("sortie");

    // Réassort réel (pas lié à une facture) — doit toujours compter.
    await stockService.enregistrerEntree(produitId, depotId, 50, "u1");

    const { factureId } = await venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: "Client Dashboard",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId, quantite: 10, prixUnitaire: 10000, allocationsDepots: [{ emplacementId: depotId, quantite: 10 }] }],
    });

    // Juste après la vente (avant annulation) : +50 entrée (réassort), +10 sortie (vente).
    expect(mouvementRepository.sommeQuantiteParType("entree")).toBe(entreesAvant + 50);
    expect(mouvementRepository.sommeQuantiteParType("sortie")).toBe(sortiesAvant + 10);

    await venteService.annulerVente(factureId, "Erreur de saisie du client", "u1");

    // Après annulation : la sortie de la vente (10) ET sa restauration
    // (10, comptée côté brut comme une "entree") disparaissent toutes les
    // deux des totaux — seul le réassort réel (+50) reste compté.
    expect(mouvementRepository.sommeQuantiteParType("entree")).toBe(entreesAvant + 50);
    expect(mouvementRepository.sommeQuantiteParType("sortie")).toBe(sortiesAvant);
  });

  it("sans la correction, la restauration d'annulation serait bien comptée comme une entrée brute (preuve que le mouvement existe réellement, juste exclu par le JOIN)", async () => {
    const brut = (
      db.prepare("SELECT COALESCE(SUM(quantite), 0) as total FROM mouvements WHERE type = 'entree'").get() as { total: number }
    ).total;
    const corrige = mouvementRepository.sommeQuantiteParType("entree");
    // Le total brut (sans exclusion) doit être strictement supérieur au
    // total corrigé — preuve que la restauration d'annulation existe bien
    // en base et serait comptée sans le correctif.
    expect(brut).toBeGreaterThan(corrige);
  });

  it("la série 7 jours exclut également les mouvements liés à une facture annulée", async () => {
    const serie = mouvementRepository.serieEntreesSortiesSeptJours();
    const aujourdHui = serie[serie.length - 1]!;
    // La vente annulée du test précédent portait sur 10, le réassort sur
    // 50 — seul le réassort doit apparaître dans les entrées du jour, et
    // aucune sortie ne doit apparaître (vente annulée exclue).
    expect(aujourdHui.entrees).toBe(50);
    expect(aujourdHui.sorties).toBe(0);
  });

  it("une vente NON annulée continue de compter normalement dans les deux totaux", async () => {
    const entreesAvant = mouvementRepository.sommeQuantiteParType("entree");
    const sortiesAvant = mouvementRepository.sommeQuantiteParType("sortie");

    await venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: "Client Normal",
      clientTelephone: "077000001",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId, quantite: 5, prixUnitaire: 10000, allocationsDepots: [{ emplacementId: depotId, quantite: 5 }] }],
    });

    expect(mouvementRepository.sommeQuantiteParType("entree")).toBe(entreesAvant);
    expect(mouvementRepository.sommeQuantiteParType("sortie")).toBe(sortiesAvant + 5);
  });

  it("annulerMouvement sur une entrée manuelle restaure le stock et exclut le mouvement des totaux", async () => {
    await stockService.enregistrerEntree(produitId, depot2Id, 20, "u1");
    const stockAvant = stockRepository.getQuantite(produitId, depot2Id);
    const entreesAvant = mouvementRepository.sommeQuantiteParType("entree");

    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "entree" && m.emplacementId === depot2Id && m.quantite === 20 && !m.annuleLe)!.id;

    stockService.annulerMouvement(mouvementId, "u1", "Erreur de saisie — 60 cartons attendus, pas 20");

    expect(stockRepository.getQuantite(produitId, depot2Id)).toBe(stockAvant - 20);
    expect(mouvementRepository.sommeQuantiteParType("entree")).toBe(entreesAvant - 20);
    const mouvementAnnule = mouvementRepository.findById(mouvementId)!;
    expect(mouvementAnnule.annuleLe).not.toBeNull();
    expect(mouvementAnnule.motifAnnulation).toBe("Erreur de saisie — 60 cartons attendus, pas 20");
  });

  it("annulerMouvement sur une sortie manuelle restaure (ajoute) le stock et exclut le mouvement des totaux", async () => {
    await stockService.enregistrerEntree(produitId, depot2Id, 30, "u1");
    await stockService.enregistrerSortie(produitId, depot2Id, 12, "u1");
    const stockAvant = stockRepository.getQuantite(produitId, depot2Id);
    const sortiesAvant = mouvementRepository.sommeQuantiteParType("sortie");

    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "sortie" && m.emplacementId === depot2Id && m.quantite === 12 && !m.annuleLe)!.id;

    stockService.annulerMouvement(mouvementId, "u1", "Sortie non nécessaire finalement");

    expect(stockRepository.getQuantite(produitId, depot2Id)).toBe(stockAvant + 12);
    expect(mouvementRepository.sommeQuantiteParType("sortie")).toBe(sortiesAvant - 12);
  });

  it("rejette l'annulation d'un mouvement déjà annulé", async () => {
    await stockService.enregistrerEntree(produitId, depot2Id, 8, "u1");
    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "entree" && m.emplacementId === depot2Id && m.quantite === 8 && !m.annuleLe)!.id;
    stockService.annulerMouvement(mouvementId, "u1", "Premier motif");
    expect(() => stockService.annulerMouvement(mouvementId, "u1", "Deuxième tentative")).toThrow(StockValidationError);
  });

  it("rejette l'annulation sans motif", async () => {
    await stockService.enregistrerEntree(produitId, depot2Id, 9, "u1");
    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "entree" && m.emplacementId === depot2Id && m.quantite === 9 && !m.annuleLe)!.id;
    expect(() => stockService.annulerMouvement(mouvementId, "u1", "")).toThrow(StockValidationError);
  });

  it("rejette l'annulation d'une entrée si une partie du stock a déjà été reprélevée ailleurs (stock insuffisant pour revenir en arrière)", async () => {
    // Produit dédié à ce test — isole totalement du stock déjà accumulé
    // par les tests précédents sur depot2Id, jamais un calcul fragile
    // basé sur un solde partagé entre tests.
    const produitIsoleId = new ProduitRepository(db).create({
      motif: "Carreau isolé",
      type: "carrelage",
      taille: "25x25",
      tailleTri: 25,
      reference: "ISOLE-001",
      prix: 7000,
      seuilAlerte: 0,
    });
    await stockService.enregistrerEntree(produitIsoleId, depot2Id, 10, "u1");
    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "entree" && m.produitId === produitIsoleId && m.quantite === 10 && !m.annuleLe)!.id;
    // Une partie du stock reçu part ailleurs avant l'annulation — il n'en
    // reste plus assez pour revenir en arrière sur les 10 d'origine.
    await stockService.enregistrerSortie(produitIsoleId, depot2Id, 7, "u1");
    expect(stockRepository.getQuantite(produitIsoleId, depot2Id)).toBe(3);
    expect(() => stockService.annulerMouvement(mouvementId, "u1", "Tentative impossible")).toThrow(domainStock.InsufficientStockError);
  });

  it("ecoulerStockPourSuppression crée une VRAIE sortie par dépôt concerné, comptée normalement (jamais exclue)", async () => {
    const autreProduitId = new ProduitRepository(db).create({
      motif: "Carreau à retirer",
      type: "carrelage",
      taille: "30x30",
      tailleTri: 30,
      reference: "RETRAIT-001",
      prix: 5000,
      seuilAlerte: 0,
    });
    await stockService.enregistrerEntree(autreProduitId, depotId, 15, "u1");
    await stockService.enregistrerEntree(autreProduitId, depot2Id, 25, "u1");
    const sortiesAvant = mouvementRepository.sommeQuantiteParType("sortie");

    stockService.ecoulerStockPourSuppression(autreProduitId, "u1");

    expect(stockRepository.getQuantite(autreProduitId, depotId)).toBe(0);
    expect(stockRepository.getQuantite(autreProduitId, depot2Id)).toBe(0);
    // 15 + 25 = 40, réellement comptés (pas exclus : ce stock part pour de vrai).
    expect(mouvementRepository.sommeQuantiteParType("sortie")).toBe(sortiesAvant + 40);
  });

  it("ecoulerStockPourSuppression ne crée aucun mouvement pour un produit sans stock", async () => {
    const produitVideId = new ProduitRepository(db).create({
      motif: "Carreau jamais stocké",
      type: "carrelage",
      taille: "20x20",
      tailleTri: 20,
      reference: "VIDE-001",
      prix: 3000,
      seuilAlerte: 0,
    });
    const avant = mouvementRepository.list(1000).length;
    stockService.ecoulerStockPourSuppression(produitVideId, "u1");
    expect(mouvementRepository.list(1000).length).toBe(avant);
  });

  it("rejette l'annulation d'un mouvement manuel vieux de plus de 48h — correction 'l'annulation doit être limitée dans le temps'", async () => {
    await stockService.enregistrerEntree(produitId, depot2Id, 6, "u1");
    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "entree" && m.emplacementId === depot2Id && m.quantite === 6 && !m.annuleLe)!.id;

    // Recule artificiellement la date du mouvement de 49h — reproduit
    // réellement "plus de 48h se sont écoulées", jamais une simple
    // supposition sur l'horloge du test.
    const il_y_a_49h = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE mouvements SET date = ? WHERE id = ?").run(il_y_a_49h, mouvementId);

    expect(domainStock.peutEncoreAnnulerMouvement(il_y_a_49h)).toBe(false);
    expect(() => stockService.annulerMouvement(mouvementId, "u1", "Trop tard")).toThrow(StockValidationError);
    // Le stock n'a pas bougé — l'annulation a été refusée avant tout effet de bord.
    expect(mouvementRepository.findById(mouvementId)!.annuleLe).toBeNull();
  });

  it("accepte l'annulation d'un mouvement manuel vieux de 47h (dans le délai de 48h)", async () => {
    await stockService.enregistrerEntree(produitId, depot2Id, 4, "u1");
    const mouvementId = mouvementRepository
      .list(1000)
      .find((m) => m.type === "entree" && m.emplacementId === depot2Id && m.quantite === 4 && !m.annuleLe)!.id;

    const il_y_a_47h = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE mouvements SET date = ? WHERE id = ?").run(il_y_a_47h, mouvementId);

    expect(() => stockService.annulerMouvement(mouvementId, "u1", "Encore dans les temps")).not.toThrow();
    expect(mouvementRepository.findById(mouvementId)!.annuleLe).not.toBeNull();
  });
});
