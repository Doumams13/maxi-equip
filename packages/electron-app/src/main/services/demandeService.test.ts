import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

/**
 * Correction "Workflow réel des demandes" — tests réels (vraie base
 * SQLite fichier). `DemandeService` ne dépend plus de `VenteService` —
 * `VenteService` est instancié séparément dans ces tests uniquement
 * pour simuler ce que fait RÉELLEMENT `VentesScreen` (créer la vente
 * directement via `ventes:create`), puis lier la demande APRÈS coup via
 * `marquerTraitee()`, exactement comme le fera l'application réelle.
 */
const CHEMIN_DB = join(tmpdir(), "test-demande-workflow-integration.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("DemandeService — Correction workflow réel (base SQLite réelle)", () => {
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
      reference: "DEM-WF-001",
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
    const demandeRepository = new DemandeRepository(db);
    const notificationRepository = new NotificationRepository(db);
    return new DemandeService(demandeRepository, notificationRepository, stockRepository);
  }

  /** Simule EXACTEMENT ce que fait VentesScreen : un vrai VenteService, une vraie vente. */
  function creerVenteReelle() {
    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const factureRepository = new FactureRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    const produitRepository = new ProduitRepository(db);
    return new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository);
  }

  it("TEST 1 — nouvelle demande reçue : statut Nouvelle, notification créée, entrée de suivi initiale", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Jean Client",
      clientTelephone: "+241 01 02 03 04",
      clientAdresse: "Libreville, Akébé",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
    });

    expect(demande.statut).toBe("nouvelle");
    const notif = db.prepare("SELECT * FROM notifications WHERE demande_id = ?").get(demande.id) as { type: string } | undefined;
    expect(notif?.type).toBe("demande");

    const suivi = service.listerSuivi(demande.id);
    expect(suivi).toHaveLength(1);
    expect(suivi[0]!.statut).toBe("nouvelle");
  });

  it("TEST 3 — changement de statut nouvelle -> à contacter, réellement enregistré", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "A Contacter",
      clientTelephone: "+241 02 02 02 02",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const modifiee = service.marquerSuivi(demande.id, "a_contacter");
    expect(modifiee.statut).toBe("a_contacter");
    const relu = db.prepare("SELECT statut FROM demandes WHERE id = ?").get(demande.id) as { statut: string };
    expect(relu.statut).toBe("a_contacter");
  });

  it("TEST 4 — commentaire de suivi facultatif sauvegardé, historique correct", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Avec Commentaire",
      clientTelephone: "+241 03 03 03 03",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    service.marquerSuivi(demande.id, "a_contacter", "Client absent, rappeler demain.");

    const suivi = service.listerSuivi(demande.id);
    expect(suivi[0]!.statut).toBe("a_contacter");
    expect(suivi[0]!.commentaire).toBe("Client absent, rappeler demain.");
    expect(suivi).toHaveLength(2);
  });

  it("le commentaire de suivi reste facultatif — un changement de statut sans commentaire fonctionne normalement", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Sans Commentaire",
      clientTelephone: "+241 04 04 04 04",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const modifiee = service.marquerSuivi(demande.id, "a_contacter");
    expect(modifiee.statut).toBe("a_contacter");
    expect(service.listerSuivi(demande.id)[0]!.commentaire).toBeNull();
  });

  it("TEST 5 — à contacter -> en traitement, avec commentaire, historique complet et ordonné", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Progression Complete",
      clientTelephone: "+241 05 05 05 05",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    service.marquerSuivi(demande.id, "a_contacter", "Client absent, rappeler demain.");
    const enTraitement = service.marquerSuivi(demande.id, "en_cours", "Client contacté. Vérification des produits.");

    expect(enTraitement.statut).toBe("en_cours");
    const suivi = service.listerSuivi(demande.id);
    expect(suivi).toHaveLength(3);
    expect(suivi[0]!.statut).toBe("en_cours");
    expect(suivi[0]!.commentaire).toBe("Client contacté. Vérification des produits.");
  });

  it("marquerSuivi refuse un statut hors suivi (confirmee/refusee/annulee gardent leurs propres méthodes)", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Statut Invalide",
      clientTelephone: "+241 06 06 06 06",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    expect(() => service.marquerSuivi(demande.id, "confirmee")).toThrow(DemandeValidationError);
  });

  it("TEST 10 + Partie 18/19 — compteur : nouvelle/à contacter/en cours comptées, traitée/refusée/annulée jamais comptées", () => {
    const service = construireService();
    const avant = service.compterActives();

    const d1 = service.creerDepuisReception({
      clientNom: "Compteur 1",
      clientTelephone: "+241 07 07 07 07",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    expect(service.compterActives()).toBe(avant + 1);

    service.marquerSuivi(d1.id, "a_contacter");
    expect(service.compterActives()).toBe(avant + 1);

    const refusee = service.creerDepuisReception({
      clientNom: "Compteur Refusee",
      clientTelephone: "+241 08 08 08 08",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    expect(service.compterActives()).toBe(avant + 2);
    service.refuser(refusee.id, "Produit indisponible");
    expect(service.compterActives()).toBe(avant + 1);
  });

  it("TEST 9 — refus avec motif obligatoire, historique correct", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "A Refuser",
      clientTelephone: "+241 09 09 09 09",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    expect(() => service.refuser(demande.id, "")).toThrow(DemandeValidationError);
    const refusee = service.refuser(demande.id, "Produit indisponible");
    expect(refusee.statut).toBe("refusee");
    expect(refusee.refusMotif).toBe("Produit indisponible");
    expect(service.listerSuivi(demande.id)[0]!.statut).toBe("refusee");
  });

  it("annulation — distincte du refus, aucun motif requis", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "A Annuler",
      clientTelephone: "+241 10 10 10 10",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const annulee = service.annuler(demande.id);
    expect(annulee.statut).toBe("annulee");
    expect(annulee.refusMotif).toBeNull();
  });

  it("TEST 6/7/8/9 (Partie 23) + Partie 18 — SCÉNARIO BOUT-EN-BOUT COMPLET : suivi -> Traiter -> vraie vente (VenteService réel) -> liaison -> Traitée", () => {
    const service = construireService();
    const venteService = creerVenteReelle();
    const stockRepository = new StockRepository(db);

    const demande = service.creerDepuisReception({
      clientNom: "Scenario Workflow",
      clientTelephone: "+241 11 11 11 11",
      clientAdresse: "Libreville, Akébé",
      clientEmail: "client@example.com",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 2, prixIndicatif: 12000 }],
    });
    expect(demande.statut).toBe("nouvelle");

    service.marquerSuivi(demande.id, "a_contacter", "Client absent, rappeler demain.");
    service.marquerSuivi(demande.id, "en_cours", "Client contacté. Vérification des produits.");

    const donneesPourVente = service.obtenir(demande.id)!;
    expect(donneesPourVente.clientNom).toBe("Scenario Workflow");
    expect(donneesPourVente.clientTelephone).toBe("+241 11 11 11 11");
    expect(donneesPourVente.lignes[0]!.quantite).toBe(2);
    expect(donneesPourVente.statut).toBe("en_cours");

    const stockAvant = stockRepository.getQuantite(produitId, depotId);

    const resultatVente = venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: donneesPourVente.clientNom,
      clientTelephone: donneesPourVente.clientTelephone,
      clientAdresse: donneesPourVente.clientAdresse,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "especes",

      remise: 0,
      lignes: [{ produitId, quantite: 5, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 5 }] }],
    });
    expect(resultatVente.total).toBe(5 * 12000);
    expect(stockRepository.getQuantite(produitId, depotId)).toBe(stockAvant - 5);

    const demandeLiee = service.marquerTraitee(demande.id, resultatVente.factureId);
    expect(demandeLiee.statut).toBe("confirmee");
    expect(demandeLiee.factureId).toBe(resultatVente.factureId);

    const relue = service.obtenir(demande.id)!;
    expect(relue.statut).toBe("confirmee");
    expect(relue.factureId).toBe(resultatVente.factureId);
    const facture = db.prepare("SELECT numero, vendeur_utilisateur_id FROM factures WHERE id = ?").get(resultatVente.factureId) as {
      numero: string;
      vendeur_utilisateur_id: string;
    };
    expect(facture.numero).toBe(resultatVente.numero);
    expect(facture.vendeur_utilisateur_id).toBe("u1");

    expect(service.listerToutes().find((d) => d.id === demande.id)!.statut).toBe("confirmee");
  });

  it("marquerTraitee refuse une demande déjà traitée, ou refusée/annulée — jamais une double liaison", () => {
    const service = construireService();
    const venteService = creerVenteReelle();
    const demande = service.creerDepuisReception({
      clientNom: "Double Traitement",
      clientTelephone: "+241 12 12 12 12",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const resultat = venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: demande.clientNom,
      clientTelephone: demande.clientTelephone,
      clientAdresse: demande.clientAdresse,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: null,

      remise: 0,
      lignes: [{ produitId, quantite: 1, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 1 }] }],
    });
    service.marquerTraitee(demande.id, resultat.factureId);

    expect(() => service.marquerTraitee(demande.id, resultat.factureId)).toThrow(DemandeValidationError);

    const demandeAnnulee = service.creerDepuisReception({
      clientNom: "Annulee Puis Traitee",
      clientTelephone: "+241 13 13 13 13",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    service.annuler(demandeAnnulee.id);
    expect(() => service.marquerTraitee(demandeAnnulee.id, resultat.factureId)).toThrow(DemandeValidationError);
  });

  it("purge : une demande non confirmée vieille de plus de 7 jours est supprimée définitivement, une confirmée (traitée) jamais", () => {
    const service = construireService();
    const venteService = creerVenteReelle();

    const ancienne = service.creerDepuisReception({
      clientNom: "Ancienne",
      clientTelephone: "+241 14 14 14 14",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const huitJoursAvant = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE demandes SET created_at = ? WHERE id = ?").run(huitJoursAvant, ancienne.id);

    const traiteeAncienne = service.creerDepuisReception({
      clientNom: "Traitee Ancienne",
      clientTelephone: "+241 15 15 15 15",
      clientAdresse: "Libreville",
      lignes: [{ produitId, motif: "Carreau Demande Test", taille: "60x60", quantite: 1, prixIndicatif: 12000 }],
    });
    const resultat = venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: traiteeAncienne.clientNom,
      clientTelephone: traiteeAncienne.clientTelephone,
      clientAdresse: traiteeAncienne.clientAdresse,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: null,

      remise: 0,
      lignes: [{ produitId, quantite: 1, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: depotId, quantite: 1 }] }],
    });
    service.marquerTraitee(traiteeAncienne.id, resultat.factureId);
    db.prepare("UPDATE demandes SET created_at = ? WHERE id = ?").run(huitJoursAvant, traiteeAncienne.id);

    const supprimees = service.purgerDemandesAnciennes();

    expect(supprimees).toContain(ancienne.id);
    expect(service.obtenir(ancienne.id)).toBeNull();
    expect(service.obtenir(traiteeAncienne.id)).not.toBeNull();
    expect(service.obtenir(traiteeAncienne.id)!.statut).toBe("confirmee");
  });

  it("Correction 'Intégration Site Phase 5' — une demande avec un produit_id EXTERNE (jamais dans le catalogue local) est réellement acceptée, plus de contrainte de clé étrangère bloquante", () => {
    const service = construireService();
    const demande = service.creerDepuisReception({
      clientNom: "Client Site Vitrine",
      clientTelephone: "+241 20 20 20 20",
      clientAdresse: "Libreville",
      lignes: [{ produitId: "identifiant-catalogue-site-jamais-synchronise", motif: "Marbre Blanc Import", taille: "80x80", quantite: 4, prixIndicatif: 18000 }],
    });
    expect(demande.statut).toBe("nouvelle");
    expect(demande.lignes[0]!.produitId).toBe("identifiant-catalogue-site-jamais-synchronise");

    // Confirme aussi que la vérification de stock (Partie 9 de la Phase 4.1) reste sans danger sur un produit inconnu — jamais une exception qui bloquerait la consultation de la demande.
    const verification = service.verifierStock(demande.id);
    expect(verification[0]!.quantiteDisponible).toBe(0); // Inconnu localement = 0 disponible, jamais une erreur.
  });
});
