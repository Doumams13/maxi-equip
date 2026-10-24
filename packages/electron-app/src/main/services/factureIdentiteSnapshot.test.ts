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
import { ParametresRepository } from "../repositories/parametresRepository.js";
import { VenteService } from "./venteService.js";

/**
 * Correction Phase Finale, Bloc 6 — scénario OBLIGATOIRE du prompt,
 * rejoué avec une vraie base SQLite réelle (fichier, jamais un mock) :
 *   1. créer entreprise A ;
 *   2. créer vente ;
 *   3. générer facture ;
 *   4. modifier paramètres entreprise vers B ;
 *   5. régénérer la facture A ;
 *   6. vérifier qu'elle affiche toujours A.
 * Les nouvelles factures doivent utiliser B. Les factures existantes ne
 * sont jamais modifiées.
 */
const CHEMIN_DB = join(tmpdir(), "test-facture-identite-snapshot.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("Facture — instantané d'identité entreprise (Bloc 6, base réelle)", async () => {
  let db: Database.Database;
  let produitId: string;
  let shopId: string;
  let factureRepository: FactureRepository;
  let parametresRepository: ParametresRepository;
  let venteService: VenteService;

  beforeAll(async () => {
    db = ouvrirBaseDeTest();
    db.prepare(
      "INSERT INTO utilisateurs (id, identifiant, nom, role, password_hash, actif, created_at, updated_at) VALUES ('u1','test','Testeur','administrateur','x',1,?,?)"
    ).run(new Date().toISOString(), new Date().toISOString());

    const emplacementRepository = new EmplacementRepository(db);
    bootstrapDefaultEmplacements(emplacementRepository);
    shopId = emplacementRepository.list().find((e) => e.estPointDeVente)!.id;

    const produitRepository = new ProduitRepository(db);
    produitId = produitRepository.create({
      motif: "Carreau Snapshot Test",
      type: "carrelage",
      taille: "60x60",
      tailleTri: 60,
      reference: "SNAP-001",
      prix: 10000,
      seuilAlerte: 0,
    });

    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    factureRepository = new FactureRepository(db);
    parametresRepository = new ParametresRepository(db);
    venteService = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository, undefined, parametresRepository);
  });

  afterAll(async () => {
    db.close();
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  const ENTREPRISE_A = { nom: "MAXI EQUIP A", adresse: "Adresse A", quartier: "Quartier A", telephones: ["077000001"], whatsapp: "", email: "", nomAdministrateur: "Admin A", nomGerant: null, updatedAt: "" };
  const ENTREPRISE_B = { nom: "MAXI EQUIP B — Nouveau Nom", adresse: "Adresse B toute différente", quartier: "Quartier B", telephones: ["077999999"], whatsapp: "", email: "", nomAdministrateur: "Admin B", nomGerant: "Gérant B", updatedAt: "" };

  it("scénario complet obligatoire : facture A conserve A après passage à B ; nouvelle facture utilise B", async () => {
    // 1. Créer entreprise A.
    parametresRepository.setIdentite(ENTREPRISE_A);

    // 2/3. Créer une vente -> une facture est générée, capturant l'identité A à cet instant.
    const venteA = await venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: "Client A",
      clientTelephone: "077111111",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId, quantite: 5, prixUnitaire: 10000, allocationsDepots: [], fournisseurExterne: "Fournisseur", prixAchatExterne: 8000 }],
    });

    const factureAJusteApres = factureRepository.findByIdAvecVendeur(venteA.factureId);
    expect(factureAJusteApres?.identiteSnapshot).toMatchObject({ nom: "MAXI EQUIP A", adresse: "Adresse A" });

    // 4. Modifier les paramètres entreprise vers B.
    parametresRepository.setIdentite(ENTREPRISE_B);
    expect(parametresRepository.getIdentite().nom).toBe("MAXI EQUIP B — Nouveau Nom");

    // 5/6. Régénérer (relire) la facture A : doit TOUJOURS afficher A, jamais B.
    const factureARelue = factureRepository.findByIdAvecVendeur(venteA.factureId);
    expect(factureARelue?.identiteSnapshot).toMatchObject({ nom: "MAXI EQUIP A", adresse: "Adresse A", quartier: "Quartier A" });
    expect(factureARelue?.identiteSnapshot?.nom).not.toBe("MAXI EQUIP B — Nouveau Nom");

    // Une NOUVELLE vente, après le passage à B, doit capturer B.
    const venteB = await venteService.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: "Client B",
      clientTelephone: "077222222",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId, quantite: 2, prixUnitaire: 10000, allocationsDepots: [], fournisseurExterne: "Fournisseur", prixAchatExterne: 8000 }],
    });
    const factureB = factureRepository.findByIdAvecVendeur(venteB.factureId);
    expect(factureB?.identiteSnapshot).toMatchObject({ nom: "MAXI EQUIP B — Nouveau Nom", adresse: "Adresse B toute différente" });

    // La facture A, relue une TROISIÈME fois après la création de B, reste inchangée.
    const factureAFinale = factureRepository.findByIdAvecVendeur(venteA.factureId);
    expect(factureAFinale?.identiteSnapshot?.nom).toBe("MAXI EQUIP A");
  });

  it("une vente créée SANS ParametresRepository injecté (rétrocompatibilité) : identiteSnapshot est null, jamais une exception", async () => {
    const stockRepository = new StockRepository(db);
    const mouvementRepository = new MouvementRepository(db);
    const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    const produitRepository = new ProduitRepository(db);
    const serviceSansParametres = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository);

    const vente = await serviceSansParametres.enregistrerVente({
      pointDeVenteId: shopId,
      clientNom: "Client Sans Identite",
      clientTelephone: "077333333",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Testeur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId, quantite: 1, prixUnitaire: 10000, allocationsDepots: [], fournisseurExterne: "Fournisseur", prixAchatExterne: 8000 }],
    });

    const facture = factureRepository.findByIdAvecVendeur(vente.factureId);
    expect(facture?.identiteSnapshot).toBeNull();
  });

  it("une facture antérieure à la migration (identite_snapshot_json NULL en base) : lue sans erreur, identiteSnapshot vaut null", async () => {
    // Simule directement une ancienne ligne en base, jamais via le service (qui capture toujours désormais).
    db.prepare(
      `INSERT INTO factures (id, numero, date, emplacement_id, client_nom, vendeur_utilisateur_id, total, statut_livraison, created_at, updated_at)
       VALUES ('facture-ancienne', 'FAC-ANCIENNE-0001', ?, ?, 'Client Ancien', 'u1', 5000, 'en_attente', ?, ?)`
    ).run(new Date().toISOString(), shopId, new Date().toISOString(), new Date().toISOString());

    const facture = factureRepository.findById("facture-ancienne");
    expect(facture).not.toBeNull();
    expect(facture?.identiteSnapshot).toBeNull();
  });
});
