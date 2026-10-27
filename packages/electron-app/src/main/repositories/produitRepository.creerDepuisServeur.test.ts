import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ModeleRepository } from "./modeleRepository.js";
import { ProduitRepository } from "./produitRepository.js";

/**
 * Tests réels (vraie base SQLite) de `creerDepuisServeur` — correction
 * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
 * Phase 2. Le plus important à vérifier : motif/type (dénormalisés
 * localement, absents de la projection serveur — voir ProduitRow côté
 * API) sont résolus depuis le modèle local, et l'insertion est
 * REPORTÉE (jamais un motif/type inventé) si ce modèle n'existe pas
 * encore — même principe de rattrapage que les images (FK avalée,
 * retentée au prochain cycle).
 */
describe("ProduitRepository.creerDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let modeleRepository: ModeleRepository;
  let produitRepository: ProduitRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    modeleRepository = new ModeleRepository(db);
    produitRepository = new ProduitRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("résout motif/type depuis le modèle local déjà rattrapé, conserve l'id d'origine", () => {
    modeleRepository.creerDepuisServeur({ id: "modele-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null });

    const applique = produitRepository.creerDepuisServeur({
      id: "produit-serveur-1",
      modeleId: "modele-1",
      taille: "60x60",
      tailleTri: 3600,
      largeur: 60,
      hauteur: 60,
      reference: "MB-6060",
      prix: 15000,
    });

    expect(applique).toBe(true);
    const produit = produitRepository.findById("produit-serveur-1");
    expect(produit).toMatchObject({ id: "produit-serveur-1", modeleId: "modele-1", motif: "Marbre Blanc", type: "Faïence", reference: "MB-6060", prix: 15000 });
  });

  it("modèle pas ENCORE connu localement : n'insère rien, renvoie false (jamais un motif/type inventé) — retentable au prochain cycle", () => {
    const applique = produitRepository.creerDepuisServeur({
      id: "produit-serveur-1",
      modeleId: "modele-jamais-recu",
      taille: "60x60",
      tailleTri: 3600,
      largeur: 60,
      hauteur: 60,
      reference: "MB-6060",
      prix: 15000,
    });

    expect(applique).toBe(false);
    expect(produitRepository.findById("produit-serveur-1")).toBeNull();
  });

  it("une seconde réception, APRÈS que le modèle ait fini par être rattrapé, réussit — prouve le rattrapage au cycle suivant", () => {
    const echec = produitRepository.creerDepuisServeur({
      id: "produit-serveur-1",
      modeleId: "modele-1",
      taille: "60x60",
      tailleTri: 3600,
      largeur: 60,
      hauteur: 60,
      reference: "MB-6060",
      prix: 15000,
    });
    expect(echec).toBe(false);

    modeleRepository.creerDepuisServeur({ id: "modele-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null });

    const reussite = produitRepository.creerDepuisServeur({
      id: "produit-serveur-1",
      modeleId: "modele-1",
      taille: "60x60",
      tailleTri: 3600,
      largeur: 60,
      hauteur: 60,
      reference: "MB-6060",
      prix: 15000,
    });
    expect(reussite).toBe(true);
    expect(produitRepository.findById("produit-serveur-1")).not.toBeNull();
  });

  it("appelé une seconde fois sur le même id : MET À JOUR la ligne existante, jamais une seconde ligne", () => {
    modeleRepository.creerDepuisServeur({ id: "modele-1", motif: "Marbre Blanc", type: "Faïence", ordreVitrine: null });
    produitRepository.creerDepuisServeur({ id: "produit-serveur-1", modeleId: "modele-1", taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 15000 });
    produitRepository.creerDepuisServeur({ id: "produit-serveur-1", modeleId: "modele-1", taille: "60x60", tailleTri: 3600, largeur: 60, hauteur: 60, reference: "MB-6060", prix: 16000 });

    expect(produitRepository.list().filter((p) => p.id === "produit-serveur-1")).toHaveLength(1);
    expect(produitRepository.findById("produit-serveur-1")?.prix).toBe(16000);
  });
});
