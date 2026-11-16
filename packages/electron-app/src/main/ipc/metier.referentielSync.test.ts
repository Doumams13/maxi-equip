import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "../repositories/categorieRepository.js";
import { ModeleRepository } from "../repositories/modeleRepository.js";
import { SousCategorieRepository } from "../repositories/sousCategorieRepository.js";
import { SousCategorieChampRepository } from "../repositories/sousCategorieChampRepository.js";
import { SousCategorieUniteRepository } from "../repositories/sousCategorieUniteRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { ProduitRepository } from "../repositories/produitRepository.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.3 — tests d'INTÉGRATION des
 * 11 gestionnaires IPC (déclenchement réel des handlers, vérification de
 * l'entrée déposée dans `boite_envoi`, sur une VRAIE base SQLite — jamais
 * une donnée inventée).
 *
 * Écart assumé par rapport au reste du dossier `ipc/` (voir le
 * commentaire de `metier.catalogSync.test.ts` : "jamais mocké
 * `ipcMain`/`electron` dans ce projet") : cette suite mocke `electron`
 * UNIQUEMENT pour capturer les callbacks enregistrés via
 * `ipcMain.handle(...)`, afin de les déclencher directement — c'est le
 * seul moyen d'observer le câblage RÉEL des handlers (et non plus
 * seulement la forme du payload des fonctions `enqueueX`, déjà couverte
 * par `metier.catalogSync.test.ts`). Toute la couche DONNÉES (4
 * repositories référentiels + `boiteEnvoiRepository`) reste réelle, sur
 * une vraie base SQLite migrée par `runMigrations` — seul le point
 * d'entrée `ipcMain` est intercepté.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (canal: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(canal, fn);
    },
  },
  app: { getPath: () => tmpdir() },
  BrowserWindow: class {},
  dialog: {},
}));

const CHEMIN_DB = join(tmpdir(), "test-metier-referentiel-sync.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

async function appeler<T>(canal: string, ...args: unknown[]): Promise<T> {
  const fn = handlers.get(canal);
  if (!fn) throw new Error(`Canal non enregistré : ${canal}`);
  return (await fn({}, ...args)) as T;
}

function dernierPayload(boiteEnvoiRepository: BoiteEnvoiRepository, entityType: Parameters<BoiteEnvoiRepository["listerParEntite"]>[0], entityId: string): Record<string, unknown> {
  const entrees = boiteEnvoiRepository.listerParEntite(entityType, entityId);
  expect(entrees.length, `aucune entrée '${entityType}' trouvée dans boite_envoi pour ${entityId}`).toBeGreaterThan(0);
  return JSON.parse(entrees[entrees.length - 1]!.payloadJson) as Record<string, unknown>;
}

describe("Câblage IPC du référentiel commun — déclenchement réel des 11 gestionnaires (Phase 5, sous-phase 5.3)", () => {
  let db: Database.Database;
  let categorieRepository: CategorieRepository;
  let sousCategorieRepository: SousCategorieRepository;
  let sousCategorieChampRepository: SousCategorieChampRepository;
  let sousCategorieUniteRepository: SousCategorieUniteRepository;
  let boiteEnvoiRepository: BoiteEnvoiRepository;
  let modeleRepository: ModeleRepository;
  let produitRepository: ProduitRepository;

  beforeEach(async () => {
    handlers.clear();
    db = ouvrirBaseDeTest();
    categorieRepository = new CategorieRepository(db);
    sousCategorieRepository = new SousCategorieRepository(db);
    sousCategorieChampRepository = new SousCategorieChampRepository(db);
    sousCategorieUniteRepository = new SousCategorieUniteRepository(db);
    boiteEnvoiRepository = new BoiteEnvoiRepository(db);
    // Phase 5 (référentiel commun), sous-phase 5.6 — réel désormais nécessaire : catalogue:supprimerSousCategorie exige ModeleRepository pour sa garde bloquante (existeModeleActifPourSousCategorie).
    modeleRepository = new ModeleRepository(db);
    produitRepository = new ProduitRepository(db);

    const sessionManager = { get: () => ({ userId: "testeur" }) };
    const { registerMetierIpcHandlers } = await import("./metier.js");
    registerMetierIpcHandlers(
      produitRepository,
      {} as never, // emplacementRepository
      {} as never, // stockRepository
      {} as never, // mouvementRepository
      {} as never, // factureRepository
      {} as never, // parametresRepository
      boiteEnvoiRepository,
      {} as never, // stockService
      {} as never, // venteService
      {} as never, // imageService
      sessionManager as never,
      modeleRepository,
      undefined, // promotionRepository
      categorieRepository,
      sousCategorieRepository,
      sousCategorieChampRepository,
      sousCategorieUniteRepository
    );
  });

  afterEach(() => {
    db.close();
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  // --- Les 9 gestionnaires de base ---

  it("1. catalogue:creerCategorie dépose une opération 'categorie' dans boite_envoi", async () => {
    const { id } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Quincaillerie générale" });
    const payload = dernierPayload(boiteEnvoiRepository, "categorie", id);
    expect(payload).toMatchObject({ operation: "create", categorieId: id, nom: "Quincaillerie générale" });
  });

  it("2. catalogue:modifierCategorie dépose une opération 'categorie' à jour", async () => {
    const { id } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Avant" });
    await appeler("catalogue:modifierCategorie", id, { nom: "Après" });
    const payload = dernierPayload(boiteEnvoiRepository, "categorie", id);
    expect(payload).toMatchObject({ operation: "update", nom: "Après" });
  });

  it("3. catalogue:supprimerCategorie dépose une opération 'categorie' en suppression", async () => {
    const { id } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "À supprimer" });
    await appeler("catalogue:supprimerCategorie", id);
    const payload = dernierPayload(boiteEnvoiRepository, "categorie", id);
    expect(payload).toMatchObject({ operation: "delete" });
  });

  it("4. catalogue:creerSousCategorie dépose une opération 'sous_categorie' (unitesAutorisees null par défaut)", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Carreaux" });
    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie", id);
    expect(payload).toMatchObject({ operation: "create", sousCategorieId: id, categorieId, nom: "Carreaux", unitesAutorisees: null });
  });

  it("5. catalogue:modifierSousCategorie dépose une opération 'sous_categorie' à jour", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Avant" });
    await appeler("catalogue:modifierSousCategorie", id, { nom: "Après" });
    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie", id);
    expect(payload).toMatchObject({ operation: "update", nom: "Après" });
  });

  it("6. catalogue:supprimerSousCategorie dépose une opération 'sous_categorie' en suppression", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "À supprimer" });
    await appeler("catalogue:supprimerSousCategorie", id);
    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie", id);
    expect(payload).toMatchObject({ operation: "delete" });
  });

  it("7. catalogue:creerChampSousCategorie dépose une opération 'sous_categorie_champ'", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "SC" });
    const { id } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "Diamètre", type: "nombre" });
    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie_champ", id);
    expect(payload).toMatchObject({ operation: "create", champId: id, sousCategorieId, nom: "Diamètre", type: "nombre" });
  });

  it("8. catalogue:modifierChampSousCategorie dépose une opération 'sous_categorie_champ' à jour", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "SC" });
    const { id } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "Avant" });
    await appeler("catalogue:modifierChampSousCategorie", id, { nom: "Après" });
    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie_champ", id);
    expect(payload).toMatchObject({ operation: "update", nom: "Après" });
  });

  it("9. catalogue:supprimerChampSousCategorie (champ facultatif) dépose une opération 'sous_categorie_champ' en suppression — tombstone local désormais (Phase 5.6), jamais une suppression physique", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "SC" });
    const { id } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "À supprimer" });
    await appeler("catalogue:supprimerChampSousCategorie", id);
    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie_champ", id);
    expect(payload).toMatchObject({ operation: "delete", champId: id, sousCategorieId, nom: "À supprimer" });
  });

  // --- Le point critique : les 2 gestionnaires "unités" ---

  it("10. catalogue:definirUnitesSousCategorie — modification UNIQUEMENT des unités (nom/ordre inchangés) dépose bien une opération 'sous_categorie' avec la nouvelle configuration", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Ciments", ordre: 2 });
    const entreesAvant = boiteEnvoiRepository.listerParEntite("sous_categorie", sousCategorieId).length;

    await appeler("catalogue:definirUnitesSousCategorie", sousCategorieId, ["sac", "kg"]);

    const entrees = boiteEnvoiRepository.listerParEntite("sous_categorie", sousCategorieId);
    expect(entrees.length, "la modification des unités seules doit déposer une NOUVELLE entrée").toBeGreaterThan(entreesAvant);
    const payload = JSON.parse(entrees[entrees.length - 1]!.payloadJson) as Record<string, unknown>;
    // Nom/ordre INCHANGÉS, unitesAutorisees bien mises à jour : preuve que
    // la configuration est relue au moment de l'enfilage, pas mise en cache.
    // Ordre alphabétique : SousCategorieUniteRepository.obtenirConfiguration()
    // trie "ORDER BY unite_vente" (déjà existant, inchangé) — "kg" avant "sac".
    expect(payload).toMatchObject({ operation: "update", sousCategorieId, nom: "Ciments", ordre: 2, unitesAutorisees: ["kg", "sac"] });
  });

  it("11. catalogue:reinitialiserUnitesSousCategorie dépose bien une opération 'sous_categorie' avec unitesAutorisees redevenu null", async () => {
    const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
    const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Peintures" });
    await appeler("catalogue:definirUnitesSousCategorie", sousCategorieId, ["litre"]);

    await appeler("catalogue:reinitialiserUnitesSousCategorie", sousCategorieId);

    const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie", sousCategorieId);
    expect(payload).toMatchObject({ operation: "update", sousCategorieId, unitesAutorisees: null });
  });

  describe("Phase 5 (référentiel commun), sous-phase 5.6 — gardes bloquantes et confirmation renforcée", () => {
    it("Scénario 1 — catalogue:supprimerCategorie refuse tant qu'une sous-catégorie ACTIVE existe, aucun enfilage", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Plomberie" });
      await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Tuyaux" });
      const entreesAvant = boiteEnvoiRepository.listerParEntite("categorie", categorieId).length;

      const resultat = await appeler<{ success: boolean; message?: string }>("catalogue:supprimerCategorie", categorieId);

      expect(resultat.success).toBe(false);
      expect(resultat.message).toBeTruthy();
      expect(categorieRepository.findById(categorieId)).not.toBeNull(); // jamais soft-deleted.
      expect(boiteEnvoiRepository.listerParEntite("categorie", categorieId).length).toBe(entreesAvant); // aucun enfilage.
    });

    it("catalogue:supprimerCategorie réussit normalement une fois la sous-catégorie elle-même supprimée", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Plomberie" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Tuyaux" });
      await appeler("catalogue:supprimerSousCategorie", sousCategorieId);

      const resultat = await appeler<{ success: boolean }>("catalogue:supprimerCategorie", categorieId);

      expect(resultat.success).toBe(true);
      // findById() ne filtre jamais deleted_at (relecture nécessaire à l'enfilage) — soft-deleted, jamais physiquement supprimée.
      expect(categorieRepository.findById(categorieId)?.deletedAt).not.toBeNull();
      expect(categorieRepository.list().some((c) => c.id === categorieId)).toBe(false);
    });

    it("Scénario 2 — catalogue:supprimerSousCategorie refuse tant qu'un modèle ACTIF la référence, aucun enfilage", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Carrelage" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Carreaux" });
      modeleRepository.create({ motif: "Marbre Blanc", type: "Faïence", sousCategorieId });
      const entreesAvant = boiteEnvoiRepository.listerParEntite("sous_categorie", sousCategorieId).length;

      const resultat = await appeler<{ success: boolean; message?: string }>("catalogue:supprimerSousCategorie", sousCategorieId);

      expect(resultat.success).toBe(false);
      expect(resultat.message).toBeTruthy();
      expect(sousCategorieRepository.findById(sousCategorieId)).not.toBeNull();
      expect(boiteEnvoiRepository.listerParEntite("sous_categorie", sousCategorieId).length).toBe(entreesAvant);
    });

    it("Scénario 3 — catalogue:supprimerSousCategorie refuse PAR LA MÊME GARDE quand des produits sont associés (via leur modèle actif), jamais une règle redondante", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Carrelage" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Carreaux" });
      const modeleId = modeleRepository.create({ motif: "Marbre Blanc", type: "Faïence", sousCategorieId });
      produitRepository.create({ modeleId, motif: "Marbre Blanc", type: "Faïence", taille: "60x60", tailleTri: 3600, reference: "MB-6060", prix: 15000, seuilAlerte: 0 });

      const resultat = await appeler<{ success: boolean }>("catalogue:supprimerSousCategorie", sousCategorieId);

      expect(resultat.success).toBe(false);
      // Le modèle ET son produit restent intacts — aucune cascade, aucune garde séparée sur les produits.
      expect(modeleRepository.findById(modeleId)).not.toBeNull();
      expect(produitRepository.list().some((p) => p.modeleId === modeleId)).toBe(true);
    });

    it("catalogue:supprimerSousCategorie réussit normalement une fois le modèle lui-même supprimé (plus aucun modèle actif)", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Carrelage" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Carreaux" });
      const modeleId = modeleRepository.create({ motif: "Marbre Blanc", type: "Faïence", sousCategorieId });
      modeleRepository.softDelete(modeleId, "testeur");

      const resultat = await appeler<{ success: boolean }>("catalogue:supprimerSousCategorie", sousCategorieId);

      expect(resultat.success).toBe(true);
      expect(sousCategorieRepository.findById(sousCategorieId)?.deletedAt).not.toBeNull();
      expect(sousCategorieRepository.listByCategorie(categorieId).some((s) => s.id === sousCategorieId)).toBe(false);
    });

    it("Scénario 5 — catalogue:supprimerChampSousCategorie (champ OBLIGATOIRE) refuse sans confirmation explicite, aucune modification", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "SC" });
      const { id: champId } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "Diamètre", obligatoire: true });
      const entreesAvant = boiteEnvoiRepository.listerParEntite("sous_categorie_champ", champId).length;

      const resultat = await appeler<{ success: boolean; requiresConfirmation?: boolean }>("catalogue:supprimerChampSousCategorie", champId);

      expect(resultat.success).toBe(false);
      expect(resultat.requiresConfirmation).toBe(true);
      expect(boiteEnvoiRepository.listerParEntite("sous_categorie_champ", champId).length).toBe(entreesAvant);
      const champToujoursActif = sousCategorieChampRepository.listBySousCategorie(sousCategorieId).find((c) => c.id === champId);
      expect(champToujoursActif).toBeDefined(); // jamais tombstoné sans confirmation.
    });

    it("Scénario 5 (suite) — AVEC confirmation explicite : tombstone appliqué normalement, opération déposée", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "SC" });
      const { id: champId } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "Diamètre", obligatoire: true });

      const resultat = await appeler<{ success: boolean }>("catalogue:supprimerChampSousCategorie", champId, true);

      expect(resultat.success).toBe(true);
      const payload = dernierPayload(boiteEnvoiRepository, "sous_categorie_champ", champId);
      expect(payload).toMatchObject({ operation: "delete", champId });
      expect(sousCategorieChampRepository.listBySousCategorie(sousCategorieId).some((c) => c.id === champId)).toBe(false);
    });

    it("un champ FACULTATIF se supprime toujours sans confirmation (comportement normal inchangé)", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Cat" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "SC" });
      const { id: champId } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "Couleur", obligatoire: false });

      const resultat = await appeler<{ success: boolean }>("catalogue:supprimerChampSousCategorie", champId);

      expect(resultat.success).toBe(true);
    });

    it("Scénario 4 — suppression d'un champ utilisé par des produits : tombstone appliqué, absent des listes de configuration actives, valeurs déjà enregistrées sur les produits PRÉSERVÉES (liaison par texte, jamais par id)", async () => {
      const { id: categorieId } = await appeler<{ id: string }>("catalogue:creerCategorie", { nom: "Plomberie" });
      const { id: sousCategorieId } = await appeler<{ id: string }>("catalogue:creerSousCategorie", { categorieId, nom: "Tuyaux" });
      const { id: champId } = await appeler<{ id: string }>("catalogue:creerChampSousCategorie", { sousCategorieId, nom: "Diamètre", type: "nombre", uniteMesure: "mm" });
      const modeleId = modeleRepository.create({ motif: "Tuyau PVC", type: "Plomberie", sousCategorieId });
      const caracteristiquesSaisies = '[{"cle":"Diamètre","valeur":"100"}]';
      const produitId = produitRepository.create({
        modeleId,
        motif: "Tuyau PVC",
        type: "Plomberie",
        taille: "100mm",
        tailleTri: 100,
        reference: "PVC-100",
        prix: 2500,
        seuilAlerte: 0,
        caracteristiques: caracteristiquesSaisies,
      });

      const resultat = await appeler<{ success: boolean }>("catalogue:supprimerChampSousCategorie", champId);
      expect(resultat.success).toBe(true);

      // Absent des listes actives (suggestions de caractéristiques, configuration de sous-catégorie).
      expect(sousCategorieChampRepository.listBySousCategorie(sousCategorieId).some((c) => c.id === champId)).toBe(false);
      expect(Object.values(sousCategorieChampRepository.listGroupesParSousCategorie()).flat().some((c) => c.id === champId)).toBe(false);
      // La valeur déjà saisie sur le produit existant reste EXACTEMENT intacte, caractère pour caractère.
      expect(produitRepository.findById(produitId)?.caracteristiques).toBe(caracteristiquesSaisies);
    });

    it("Scénario 6 — aucune fonctionnalité de restauration n'existe (hors périmètre de cette sous-phase) : ni canal IPC, ni méthode de repository", async () => {
      expect([...handlers.keys()].some((canal) => /restaur/i.test(canal))).toBe(false);
      expect((sousCategorieChampRepository as unknown as Record<string, unknown>)["restaurer"]).toBeUndefined();
      expect((categorieRepository as unknown as Record<string, unknown>)["restaurer"]).toBeUndefined();
      expect((sousCategorieRepository as unknown as Record<string, unknown>)["restaurer"]).toBeUndefined();
    });
  });
});
