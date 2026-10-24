import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { stock as domainStock } from "@maxi-equip/domain";
import { runMigrations } from "../db/migrate.js";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "../repositories/emplacementRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { StockService } from "./stockService.js";
import { VenteService } from "./venteService.js";
import { ConnexionRequiseError, type ResultatValidationStockDistante, type DeltaStockDemande } from "./validationStockDistanteService.js";

/**
 * Correction "travailler en parallèle sur le même stock" (2026-10-22) —
 * tests réels (vraie base SQLite fichier, vrais services) de
 * l'intégration VenteService/StockService ↔ ValidationStockDistanteService.
 * Le réseau lui-même (appel HTTP vers l'API) est simulé par un faux
 * service minimal (`FauxValidationDistante`) — le vrai comportement
 * serveur (verrou de ligne, atomicité) est déjà prouvé par de vrais
 * tests PostgreSQL côté packages/api (postgresServerStorage.test.ts).
 * Ce fichier prouve l'autre moitié du contrat : que VenteService/
 * StockService réagissent CORRECTEMENT à ce que le serveur répond.
 */

class FauxValidationDistante {
  constructor(
    private readonly configuree: boolean,
    private readonly reponse: ResultatValidationStockDistante
  ) {}
  appelsRecus: DeltaStockDemande[][] = [];
  estConfiguree(): boolean {
    return this.configuree;
  }
  async valider(deltas: DeltaStockDemande[]): Promise<ResultatValidationStockDistante> {
    this.appelsRecus.push(deltas);
    return this.reponse;
  }
}

function ouvrirBaseDeTest(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  db.prepare(
    "INSERT INTO utilisateurs (id, identifiant, nom, role, password_hash, actif, created_at, updated_at) VALUES ('u1','test','Testeur','administrateur','x',1,?,?)"
  ).run(new Date().toISOString(), new Date().toISOString());
  return db;
}

describe("VenteService/StockService — validation en ligne du stock partagé (base SQLite réelle)", () => {
  let db: Database.Database;
  let produitRepository: ProduitRepository;
  let stockRepository: StockRepository;
  let mouvementRepository: MouvementRepository;
  let factureRepository: FactureRepository;
  let boiteEnvoiRepository: BoiteEnvoiRepository;
  let produitId: string;
  let depotId: string;
  let shopId: string;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    const emplacementRepository = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacementRepository);
    const emplacements = emplacementRepository.list();
    shopId = emplacements.find((e) => e.estPointDeVente)!.id;
    depotId = emplacements.filter((e) => !e.estPointDeVente)[0]!.id;

    produitRepository = new ProduitRepository(db);
    produitId = produitRepository.create({
      motif: "Carreau Validation Distante",
      type: "carrelage",
      taille: "60x60",
      tailleTri: 60,
      reference: "VAL-DIST-001",
      prix: 10000,
      seuilAlerte: 5,
    });

    stockRepository = new StockRepository(db);
    mouvementRepository = new MouvementRepository(db);
    factureRepository = new FactureRepository(db);
    boiteEnvoiRepository = new BoiteEnvoiRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function ligneVenteSimple(quantite: number) {
    return {
      pointDeVenteId: shopId,
      clientNom: "Client Test",
      clientTelephone: null,
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Admin",
      vendeurNomManuel: null,
      modeReglement: null,
      remise: 0,
      lignes: [{ produitId, quantite, prixUnitaire: 10000, allocationsDepots: [{ emplacementId: depotId, quantite }] }],
    };
  }

  describe("VenteService.enregistrerVente — synchro NON configurée (estConfiguree() false)", () => {
    it("ignore totalement le service distant : comportement 100% local inchangé, jamais appelé", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 10, produitId });
      const faux = new FauxValidationDistante(false, { success: true, stockApres: [] });
      const service = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, undefined, faux as never);

      const resultat = await service.enregistrerVente(ligneVenteSimple(3));

      expect(faux.appelsRecus).toHaveLength(0); // jamais appelé
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(7); // déduit localement, comme avant
      expect(resultat.numero).toMatch(/^FAC-\d{4}-0001$/); // numéro local, pas serveur
    });
  });

  describe("VenteService.enregistrerVente — synchro configurée, serveur OK", () => {
    it("utilise le numéro ET le stock EXACTS renvoyés par le serveur (jamais recalculés localement)", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 10, produitId }); // stock local avant
      const faux = new FauxValidationDistante(true, {
        success: true,
        numero: "FAC-2099-0042",
        stockApres: [{ produitId, emplacementId: depotId, quantite: 999 }], // volontairement très différent du calcul local (10-3=7), pour prouver que c'est la valeur SERVEUR qui gagne
      });
      const service = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, undefined, faux as never);

      const resultat = await service.enregistrerVente(ligneVenteSimple(3));

      expect(faux.appelsRecus).toHaveLength(1);
      expect(faux.appelsRecus[0]).toEqual([{ produitId, emplacementId: depotId, delta: -3 }]);
      expect(resultat.numero).toBe("FAC-2099-0042");
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(999);
    });
  });

  describe("VenteService.enregistrerVente — synchro configurée, stock insuffisant côté serveur", () => {
    it("bloque la vente, AUCUNE facture ni mouvement créé, stock local jamais touché", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 10, produitId });
      const faux = new FauxValidationDistante(true, {
        success: false,
        raison: "stock_insuffisant",
        details: [{ produitId, emplacementId: depotId, disponible: 1, demande: 3 }],
      });
      const service = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, undefined, faux as never);

      await expect(service.enregistrerVente(ligneVenteSimple(3))).rejects.toThrow(domainStock.InsufficientStockError);

      expect(factureRepository.list(10)).toHaveLength(0);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(10); // inchangé — jamais décrémenté localement
    });
  });

  describe("VenteService.enregistrerVente — synchro configurée, serveur injoignable", () => {
    it("bloque la vente avec ConnexionRequiseError, jamais basé sur le stock local", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 10, produitId });
      const faux = new FauxValidationDistante(true, { success: false, raison: "hors_ligne", message: "Connexion internet requise pour cette opération : timeout." });
      const service = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, undefined, faux as never);

      await expect(service.enregistrerVente(ligneVenteSimple(3))).rejects.toThrow(ConnexionRequiseError);
      expect(factureRepository.list(10)).toHaveLength(0);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(10);
    });
  });

  describe("VenteService.annulerVente — restaure le stock au serveur, pas seulement en local", () => {
    it("une vente validée en ligne, puis annulée, restaure le stock à la valeur EXACTE renvoyée par le serveur", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 10, produitId });
      const fauxVente = new FauxValidationDistante(true, {
        success: true,
        numero: "FAC-2099-0001",
        stockApres: [{ produitId, emplacementId: depotId, quantite: 7 }],
      });
      const service = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, undefined, fauxVente as never);
      const { factureId } = await service.enregistrerVente(ligneVenteSimple(3));
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(7);

      const fauxAnnulation = new FauxValidationDistante(true, {
        success: true,
        stockApres: [{ produitId, emplacementId: depotId, quantite: 500 }], // valeur serveur volontairement arbitraire
      });
      const serviceAnnulation = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, undefined, fauxAnnulation as never);
      await serviceAnnulation.annulerVente(factureId, "Test annulation", "u1");

      expect(fauxAnnulation.appelsRecus).toEqual([[{ produitId, emplacementId: depotId, delta: 3 }]]);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(500);
    });
  });

  describe("StockService.enregistrerEntree/Sortie/Transfert — validation en ligne", () => {
    it("enregistrerEntree : stock local fixé à la valeur serveur (self-heal d'un cache périmé)", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 5, produitId }); // stock local volontairement "périmé"
      const faux = new FauxValidationDistante(true, { success: true, stockApres: [{ produitId, emplacementId: depotId, quantite: 123 }] });
      const service = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository, faux as never);

      await service.enregistrerEntree(produitId, depotId, 20, "u1");

      expect(faux.appelsRecus).toEqual([[{ produitId, emplacementId: depotId, delta: 20 }]]);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(123);
    });

    it("enregistrerSortie : refusée par le serveur → InsufficientStockError, rien n'est écrit", async () => {
      stockRepository.applyDelta({ emplacementId: depotId, delta: 50, produitId }); // stock local dirait "suffisant", mais le serveur sait mieux
      const faux = new FauxValidationDistante(true, {
        success: false,
        raison: "stock_insuffisant",
        details: [{ produitId, emplacementId: depotId, disponible: 2, demande: 20 }],
      });
      const service = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository, faux as never);

      await expect(service.enregistrerSortie(produitId, depotId, 20, "u1")).rejects.toThrow(domainStock.InsufficientStockError);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(50); // inchangé
    });

    it("enregistrerTransfert : envoie bien les DEUX deltas (source négatif, destination positif) et applique les valeurs serveur", async () => {
      const autreDepot = new EmplacementRepository(db).list().filter((e) => !e.estPointDeVente)[1]!.id;
      stockRepository.applyDelta({ emplacementId: depotId, delta: 30, produitId });
      const faux = new FauxValidationDistante(true, {
        success: true,
        stockApres: [
          { produitId, emplacementId: depotId, quantite: 20 },
          { produitId, emplacementId: autreDepot, quantite: 10 },
        ],
      });
      const service = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository, faux as never);

      await service.enregistrerTransfert(produitId, depotId, autreDepot, 10, "u1");

      expect(faux.appelsRecus).toEqual([
        [
          { produitId, emplacementId: depotId, delta: -10 },
          { produitId, emplacementId: autreDepot, delta: 10 },
        ],
      ]);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(20);
      expect(stockRepository.getQuantite(produitId, autreDepot)).toBe(10);
    });
  });
});
