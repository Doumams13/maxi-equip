import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { ModeleRepository } from "./modeleRepository.js";
import { ImageProduitRepository } from "./imageProduitRepository.js";

/**
 * Tests réels (vraie base SQLite, `PRAGMA foreign_keys = ON`) de
 * `creerDepuisServeur` — correction "photos de carreaux absentes sur
 * poste restauré/secondaire" (2026-10-24), voir
 * `ImageService.synchroniserImagesManquantes`.
 */

describe("ImageProduitRepository — creerDepuisServeur (base réelle)", () => {
  let db: Database.Database;
  let modeles: ModeleRepository;
  let images: ImageProduitRepository;
  let modeleId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    modeles = new ModeleRepository(db);
    images = new ImageProduitRepository(db);
    modeleId = modeles.create({ motif: "Marbre Blanc", type: "Faïence" });
  });

  afterEach(() => {
    db.close();
  });

  it("insère la ligne avec l'id EXACT fourni par le serveur (jamais un nouvel UUID local)", () => {
    const cree = images.creerDepuisServeur({
      id: "11111111-1111-4111-8111-111111111111",
      modeleId,
      cheminLocal: "11111111-1111-4111-8111-111111111111.jpg",
      urlCloud: "https://api.example.com/v1/public/images?file=x.jpg",
      ordre: 0,
      estPrincipale: true,
    });

    expect(cree).toBe(true);
    const image = images.findById("11111111-1111-4111-8111-111111111111");
    expect(image).toMatchObject({ modeleId, cheminLocal: "11111111-1111-4111-8111-111111111111.jpg", estPrincipale: true });
  });

  it("estPrincipale: true rétrograde les autres images du même modèle (une seule principale à la fois)", () => {
    images.creerDepuisServeur({ id: "image-1", modeleId, cheminLocal: "a.jpg", urlCloud: null, ordre: 0, estPrincipale: true });

    images.creerDepuisServeur({ id: "image-2", modeleId, cheminLocal: "b.jpg", urlCloud: null, ordre: 1, estPrincipale: true });

    expect(images.findById("image-1")!.estPrincipale).toBe(false);
    expect(images.findById("image-2")!.estPrincipale).toBe(true);
  });

  it("modèle inexistant localement (pas encore reçu par PULL) : échoue proprement sans rien insérer, jamais une exception", () => {
    const cree = images.creerDepuisServeur({
      id: "image-orpheline",
      modeleId: "modele-jamais-recu-99999999-9999-4999-8999-999999999999",
      cheminLocal: "image-orpheline.jpg",
      urlCloud: null,
      ordre: 0,
      estPrincipale: false,
    });

    expect(cree).toBe(false);
    expect(images.findById("image-orpheline")).toBeNull();
  });
});
