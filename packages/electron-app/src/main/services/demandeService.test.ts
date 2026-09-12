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

  it("TEST 1/2/3 — suivi : nouvelle -> à contacter -> contactée, réellement enregistré en base", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Suivi Test",
      clientTelephone: "+241 20 20 20 20",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    expect(demande.statut).toBe("nouvelle");

    const aContacter = service.marquerSuivi(demande.id, "a_contacter");
    expect(aContacter.statut).toBe("a_contacter");
    // Réellement en base, pas seulement en mémoire — relecture depuis un objet fraîchement chargé.
    expect(service.obtenir(demande.id)!.statut).toBe("a_contacter");

    const contactee = service.marquerSuivi(demande.id, "contactee");
    expect(contactee.statut).toBe("contactee");
    expect(service.obtenir(demande.id)!.statut).toBe("contactee");
  });

  it("marquerSuivi refuse de s'appliquer sur une demande déjà confirmée/refusée/annulée", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Suivi Refuse",
      clientTelephone: "+241 21 21 21 21",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    service.refuser(demande.id, "Test");
    expect(() => service.marquerSuivi(demande.id, "contactee")).toThrow(DemandeValidationError);
  });

  it("TEST 5/6 + Partie 8 — ajout et suppression de produit dans une demande, jamais d'impact sur le stock", () => {
    const service = construireService();
    const stockRepository = new StockRepository(db);
    const demande = service.creerDepuisReception({
      clientNom: "Ajout Produit",
      clientTelephone: "+241 22 22 22 22",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
    });

    const stockAvant = stockRepository.getQuantite(produitId, depotId);

    // Ajout d'une seconde ligne (Partie 7) — remplace bien l'ensemble tout en conservant la première.
    const avecAjout = service.modifierLignes(demande.id, [
      { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 },
      { produitId, motif: "Carreau Demande Test", taille: "30x30", quantite: 3, prixIndicatif: 8000 },
    ]);
    expect(avecAjout.lignes).toHaveLength(2);
    expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvant); // Toujours inchangé.

    // Suppression d'une ligne (Partie 6/9).
    const apresSuppression = service.modifierLignes(demande.id, [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }]);
    expect(apresSuppression.lignes).toHaveLength(1);
    expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvant); // Toujours inchangé, même après suppression.
  });

  it("TEST 7 — modification des informations client, sauvegarde réelle", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Ancien Nom",
      clientTelephone: "+241 23 23 23 23",
      clientAdresse: "Ancienne adresse",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });

    const modifiee = service.modifierClient(demande.id, { clientNom: "Nouveau Nom", clientAdresse: "Nouvelle adresse, Akanda" });
    expect(modifiee.clientNom).toBe("Nouveau Nom");
    expect(modifiee.clientAdresse).toBe("Nouvelle adresse, Akanda");
    expect(modifiee.clientTelephone).toBe("+241 23 23 23 23"); // Champ non fourni conservé tel quel.
    expect(service.obtenir(demande.id)!.clientNom).toBe("Nouveau Nom"); // Réellement persistée.
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

  describe("Correction \"Suivi et modification des demandes\" — marquerSuivi et scénario bout-en-bout complet (Partie 17/18)", () => {
    it("TEST 1/2/3 — progression réelle du suivi : nouvelle -> à contacter -> contactée -> en cours", () => {
      const service = construireService();
      const demande = service.creerDepuisReception({
        clientNom: "Suivi Test",
        clientTelephone: "+241 20 20 20 20",
        clientAdresse: "Libreville",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
      });
      expect(demande.statut).toBe("nouvelle"); // TEST 1.

      const aContacter = service.marquerSuivi(demande.id, "a_contacter");
      expect(aContacter.statut).toBe("a_contacter"); // TEST 2.

      const contactee = service.marquerSuivi(demande.id, "contactee");
      expect(contactee.statut).toBe("contactee"); // TEST 3.

      const enCours = service.marquerSuivi(demande.id, "en_cours");
      expect(enCours.statut).toBe("en_cours");

      // Réellement enregistré en base — jamais une indication visuelle temporaire (Partie 4).
      const relu = db.prepare("SELECT statut FROM demandes WHERE id = ?").get(demande.id) as { statut: string };
      expect(relu.statut).toBe("en_cours");
    });

    it("marquerSuivi refuse un statut qui n'est pas un statut de suivi (jamais confirmee/refusee/annulee par cette voie)", () => {
      const service = construireService();
      const demande = service.creerDepuisReception({
        clientNom: "Suivi Invalide",
        clientTelephone: "+241 21 21 21 21",
        clientAdresse: "Libreville",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
      });
      expect(() => service.marquerSuivi(demande.id, "confirmee")).toThrow(DemandeValidationError);
    });

    it("TEST 4 — modification de quantité : demande mise à jour, aucune vente, aucun mouvement, aucun changement de stock", () => {
      const service = construireService();
      const stockRepository = new StockRepository(db);
      const demande = service.creerDepuisReception({
        clientNom: "Modif Quantite",
        clientTelephone: "+241 22 22 22 22",
        clientAdresse: "Libreville",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
      });
      const stockAvant = stockRepository.getQuantite(produitId, depotId);
      const facturesAvant = (db.prepare("SELECT COUNT(*) as n FROM factures").get() as { n: number }).n;

      const modifiee = service.modifierLignes(demande.id, [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 5, prixIndicatif: 12000 }]);

      expect(modifiee.lignes[0]!.quantite).toBe(5);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvant); // Stock inchangé.
      expect((db.prepare("SELECT COUNT(*) as n FROM factures").get() as { n: number }).n).toBe(facturesAvant); // Aucune vente créée.
    });

    it("TEST 5 — ajout d'un produit : nouvelle ligne créée, aucune vente, aucun changement de stock", () => {
      const service = construireService();
      const stockRepository = new StockRepository(db);
      const demande = service.creerDepuisReception({
        clientNom: "Ajout Produit",
        clientTelephone: "+241 23 23 23 23",
        clientAdresse: "Libreville",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
      });
      const stockAvant = stockRepository.getQuantite(produitId, depotId);

      const modifiee = service.modifierLignes(demande.id, [
        { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 },
        { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 3, prixIndicatif: 12000 },
      ]);

      expect(modifiee.lignes).toHaveLength(2);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvant);
    });

    it("TEST 6 — suppression d'un produit : ligne supprimée, demande cohérente (au moins une ligne conservée)", () => {
      const service = construireService();
      const demande = service.creerDepuisReception({
        clientNom: "Suppression Produit",
        clientTelephone: "+241 24 24 24 24",
        clientAdresse: "Libreville",
        lignes: [
          { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 },
          { produitId, motif: "Carreau Demande Test", taille: "30x30", quantite: 3, prixIndicatif: 8000 },
        ],
      });
      expect(demande.lignes).toHaveLength(2);

      const modifiee = service.modifierLignes(demande.id, [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }]);
      expect(modifiee.lignes).toHaveLength(1);

      // Une demande ne peut jamais rester sans aucun produit (garde déjà existante, revérifiée ici).
      expect(() => service.modifierLignes(demande.id, [])).toThrow(DemandeValidationError);
    });

    it("TEST 7 — modification des informations client, sauvegarde réelle vérifiée", () => {
      const service = construireService();
      const demande = service.creerDepuisReception({
        clientNom: "Nom Original",
        clientTelephone: "+241 25 25 25 25",
        clientAdresse: "Adresse Originale",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
      });

      const modifiee = service.modifierClient(demande.id, { clientNom: "Nom Corrigé", clientTelephone: "+241 99 99 99 99" });
      expect(modifiee.clientNom).toBe("Nom Corrigé");
      expect(modifiee.clientTelephone).toBe("+241 99 99 99 99");
      expect(modifiee.clientAdresse).toBe("Adresse Originale"); // Champ non fourni, conservé tel quel.

      const relue = db.prepare("SELECT client_nom FROM demandes WHERE id = ?").get(demande.id) as { client_nom: string };
      expect(relue.client_nom).toBe("Nom Corrigé");
    });

    it("TEST 8 + Partie 18 — SCÉNARIO BOUT-EN-BOUT COMPLET : suivi, contact, modification (quantité + ajout produit), puis confirmation réelle", () => {
      const service = construireService();
      const stockRepository = new StockRepository(db);

      // 1-2. Une demande arrive : Produit A, quantité 2. Statut nouvelle.
      const demande = service.creerDepuisReception({
        clientNom: "Scenario Complet",
        clientTelephone: "+241 26 26 26 26",
        clientAdresse: "Libreville, Akébé",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
      });
      expect(demande.statut).toBe("nouvelle");

      // 3. À contacter.
      service.marquerSuivi(demande.id, "a_contacter");
      // 4-5. Contacté -> Client contacté.
      service.marquerSuivi(demande.id, "contactee");
      expect(service.obtenir(demande.id)!.statut).toBe("contactee");

      // 6-8. Le client veut finalement 5 produits — modification réelle.
      const stockAvantModif = stockRepository.getQuantite(produitId, depotId);
      let modifiee = service.modifierLignes(demande.id, [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 5, prixIndicatif: 12000 }]);
      expect(modifiee.lignes[0]!.quantite).toBe(5);

      // 9-10. Le client ajoute un Produit B — ajout réel d'une seconde ligne.
      modifiee = service.modifierLignes(demande.id, [
        { produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 5, prixIndicatif: 12000 },
        { produitId, motif: "Carreau Demande Test", taille: "30x30", quantite: 3, prixIndicatif: 8000 },
      ]);

      // 11-12. Vérifier : demande modifiée, stock inchangé.
      expect(modifiee.lignes).toHaveLength(2);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvantModif); // Aucun stock touché par la modification.

      // 13-14. Confirmation réelle : vente créée, quantités correctes, stock modifié SEULEMENT maintenant, facture créée.
      const resultat = service.confirmer(demande.id, {
        pointDeVenteId: shopId,
        vendeurUtilisateurId: "u1",
        vendeurCompteConnecteNom: "Testeur",
        vendeurNomManuel: null,
        modeReglement: "especes",
        lignes: [
          { produitId, quantite: 5, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 5 }] },
          { produitId, quantite: 3, prixUnitaire: 8000, allocationsDepots: [{ emplacementId: depotId, quantite: 3 }] },
        ],
      });

      expect(resultat.total).toBe(5 * 12000 + 3 * 8000);
      expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvantModif - 8); // Stock modifié SEULEMENT maintenant (5+3=8).
      expect(service.obtenir(demande.id)!.statut).toBe("confirmee");
      expect(service.obtenir(demande.id)!.factureId).toBe(resultat.factureId);

      const facture = db.prepare("SELECT * FROM factures WHERE id = ?").get(resultat.factureId) as { vendeur_utilisateur_id: string };
      expect(facture.vendeur_utilisateur_id).toBe("u1");
    });

    it("TEST 9 — refus après suivi (motif conservé, statut correct)", () => {
      const service = construireService();
      const demande = service.creerDepuisReception({
        clientNom: "Refus Apres Suivi",
        clientTelephone: "+241 27 27 27 27",
        clientAdresse: "Libreville",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
      });
      service.marquerSuivi(demande.id, "a_contacter");
      service.marquerSuivi(demande.id, "contactee");

      const refusee = service.refuser(demande.id, "Client finalement non intéressé");
      expect(refusee.statut).toBe("refusee");
      expect(refusee.refusMotif).toBe("Client finalement non intéressé");
    });

    it("TEST 10 — annulation (statut correct)", () => {
      const service = construireService();
      const demande = service.creerDepuisReception({
        clientNom: "Annulation Test",
        clientTelephone: "+241 28 28 28 28",
        clientAdresse: "Libreville",
        lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
      });
      const annulee = service.annuler(demande.id);
      expect(annulee.statut).toBe("annulee");
    });
  });
});
