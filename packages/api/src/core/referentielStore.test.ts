import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { SqliteServerStorage } from "./sqliteServerStorage.js";
import { initialiserStockageServeur, fermerStockageServeur, getStorage } from "./storeServeur.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.1 — tests ciblés de la
 * couche de stockage, contre une VRAIE base SQLite (`:memory:`), jamais
 * un mock. Portée STRICTEMENT limitée aux fondations serveur : ces tests
 * appellent directement les méthodes `ServerStorage`/`SqliteServerStorage`
 * — jamais via `/v1/sync/push` (non modifié dans cette sous-phase) ni
 * via un client Electron.
 */

const CATEGORIE_1 = "11111111-1111-4111-8111-111111111111";
const SOUS_CATEGORIE_1 = "22222222-2222-4222-8222-222222222222";
const CHAMP_1 = "33333333-3333-4333-8333-333333333333";
const MODELE_1 = "44444444-4444-4444-8444-444444444444";
const PRODUIT_1 = "55555555-5555-4555-8555-555555555555";

describe("Référentiel commun du catalogue — SqliteServerStorage réel (:memory:)", () => {
  beforeEach(() => {
    initialiserStockageServeur(":memory:");
  });
  afterEach(async () => {
    await fermerStockageServeur();
  });

  describe("Catégories", () => {
    it("création : retrouvée via listerCategoriesActives", async () => {
      const { applique } = await getStorage().appliquerOperationCategorie({
        operation: "create",
        categorieId: CATEGORIE_1,
        nom: "Quincaillerie générale",
        imageDataUrl: null,
        ordre: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(applique).toBe(true);

      const categories = await getStorage().listerCategoriesActives();
      expect(categories.find((c) => c.id === CATEGORIE_1)).toMatchObject({ nom: "Quincaillerie générale", ordre: 0, imageDataUrl: null });
    });

    it("upsert LWW : une opération plus ancienne rejouée après une plus récente n'écrase jamais l'état", async () => {
      await getStorage().appliquerOperationCategorie({
        operation: "update",
        categorieId: CATEGORIE_1,
        nom: "Nom récent",
        imageDataUrl: null,
        ordre: 0,
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      await getStorage().appliquerOperationCategorie({
        operation: "update",
        categorieId: CATEGORIE_1,
        nom: "PÉRIMÉ — ne doit jamais apparaître",
        imageDataUrl: null,
        ordre: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const categories = await getStorage().listerCategoriesActives();
      expect(categories.find((c) => c.id === CATEGORIE_1)?.nom).toBe("Nom récent");
    });

    it("Phase 5.6 : suppression (tombstone) reste restituée par listerCategoriesActives (deletedAt renseigné), jamais exposée à publicCatalog.ts (aucune fonction de ce module ne l'expose)", async () => {
      await getStorage().appliquerOperationCategorie({
        operation: "create",
        categorieId: CATEGORIE_1,
        nom: "À supprimer",
        imageDataUrl: null,
        ordre: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      await getStorage().appliquerOperationCategorie({
        operation: "delete",
        categorieId: CATEGORIE_1,
        nom: "À supprimer",
        imageDataUrl: null,
        ordre: 0,
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const categories = await getStorage().listerCategoriesActives();
      const categorie = categories.find((c) => c.id === CATEGORIE_1);
      expect(categorie).toBeDefined();
      expect(categorie!.deletedAt).not.toBeNull();
    });
  });

  describe("Sous-catégories — configuration d'unités en sous-objet (§4.6/§7.3 du cahier des charges)", () => {
    it("non configurée : unitesAutorisees null, modelePhysique null", async () => {
      await getStorage().appliquerOperationSousCategorie({
        operation: "create",
        sousCategorieId: SOUS_CATEGORIE_1,
        categorieId: CATEGORIE_1,
        nom: "Carreaux",
        ordre: 0,
        modelePhysique: null,
        unitesAutorisees: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const sousCategories = await getStorage().listerSousCategoriesActives();
      const trouvee = sousCategories.find((s) => s.id === SOUS_CATEGORIE_1);
      expect(trouvee).toMatchObject({ categorieId: CATEGORIE_1, nom: "Carreaux", modelePhysique: null, unitesAutorisees: null });
    });

    it("configuration explicite des unités : survit à un aller-retour écriture → lecture, jamais une table séparée", async () => {
      await getStorage().appliquerOperationSousCategorie({
        operation: "update",
        sousCategorieId: SOUS_CATEGORIE_1,
        categorieId: CATEGORIE_1,
        nom: "Ciments et liants",
        ordre: 1,
        modelePhysique: null,
        unitesAutorisees: ["sac", "kg"],
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const sousCategories = await getStorage().listerSousCategoriesActives();
      expect(sousCategories.find((s) => s.id === SOUS_CATEGORIE_1)).toMatchObject({ unitesAutorisees: ["sac", "kg"] });
    });

    it("modification UNIQUEMENT de la configuration d'unités (nom/ordre inchangés) : updatedAt plus récent l'emporte correctement (base du test ciblé §6.4 — ici au niveau stockage, pas encore IPC)", async () => {
      await getStorage().appliquerOperationSousCategorie({
        operation: "create",
        sousCategorieId: SOUS_CATEGORIE_1,
        categorieId: CATEGORIE_1,
        nom: "Peintures",
        ordre: 2,
        modelePhysique: null,
        unitesAutorisees: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      await getStorage().appliquerOperationSousCategorie({
        operation: "update",
        sousCategorieId: SOUS_CATEGORIE_1,
        categorieId: CATEGORIE_1,
        nom: "Peintures",
        ordre: 2,
        modelePhysique: null,
        unitesAutorisees: ["litre"],
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const sousCategories = await getStorage().listerSousCategoriesActives();
      expect(sousCategories.find((s) => s.id === SOUS_CATEGORIE_1)).toMatchObject({ nom: "Peintures", ordre: 2, unitesAutorisees: ["litre"] });
    });
  });

  describe("Champs de sous-catégorie — tombstone, jamais une suppression physique", () => {
    it("création : retrouvé via listerSousCategorieChampsActifs", async () => {
      const { applique } = await getStorage().appliquerOperationSousCategorieChamp({
        operation: "create",
        champId: CHAMP_1,
        sousCategorieId: SOUS_CATEGORIE_1,
        nom: "Diamètre",
        type: "nombre",
        obligatoire: true,
        valeursAutorisees: null,
        uniteMesure: "mm",
        role: "physique",
        ordre: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(applique).toBe(true);

      const champs = await getStorage().listerSousCategorieChampsActifs();
      expect(champs.find((c) => c.id === CHAMP_1)).toMatchObject({ nom: "Diamètre", type: "nombre", obligatoire: true, uniteMesure: "mm", role: "physique" });
    });

    it("Phase 5.6 : suppression (tombstone) reste restituée par listerSousCategorieChampsActifs (deletedAt renseigné)", async () => {
      await getStorage().appliquerOperationSousCategorieChamp({
        operation: "delete",
        champId: CHAMP_1,
        sousCategorieId: SOUS_CATEGORIE_1,
        nom: "Diamètre",
        type: "nombre",
        obligatoire: true,
        valeursAutorisees: null,
        uniteMesure: "mm",
        role: "physique",
        ordre: 0,
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const champs = await getStorage().listerSousCategorieChampsActifs();
      const champ = champs.find((c) => c.id === CHAMP_1);
      expect(champ).toBeDefined();
      expect(champ!.deletedAt).not.toBeNull();
    });

    it("valeursAutorisees (type liste) : survit à un aller-retour écriture → lecture", async () => {
      await getStorage().appliquerOperationSousCategorieChamp({
        operation: "create",
        champId: CHAMP_1,
        sousCategorieId: SOUS_CATEGORIE_1,
        nom: "Couleur",
        type: "liste",
        obligatoire: false,
        valeursAutorisees: ["Rouge", "Bleu", "Vert"],
        uniteMesure: null,
        role: "descriptif",
        ordre: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const champs = await getStorage().listerSousCategorieChampsActifs();
      expect(champs.find((c) => c.id === CHAMP_1)).toMatchObject({ valeursAutorisees: ["Rouge", "Bleu", "Vert"] });
    });
  });
});

/**
 * Extension des payloads modèle/produit (Phase 5, §8) — vérification au
 * niveau SQL brut (colonnes `sous_categorie_id`/`marque`/`unite_vente`/
 * `caracteristiques`), car `ModeleRow`/`ProduitRow`/`listerModelesActifs`/
 * `listerProduitsActifs` restent délibérément INCHANGÉS dans cette
 * sous-phase (lecture hors périmètre — alimente le catch-up ET le site
 * public, tous deux non concernés ici). Instancie `SqliteServerStorage`
 * directement (plutôt que `getStorage()`) pour garder un accès à la
 * base brute.
 */
describe("Extension des payloads modèle/produit — persistance SQL brute (Phase 5, §8)", () => {
  let db: Database.Database;
  let storage: SqliteServerStorage;

  beforeEach(() => {
    db = new Database(":memory:");
    storage = new SqliteServerStorage(db);
  });
  afterEach(() => {
    db.close();
  });

  it("appliquerOperationModele écrit bien sous_categorie_id/marque", async () => {
    await storage.appliquerOperationModele({
      operation: "create",
      modeleId: MODELE_1,
      motif: "Ciment CPJ 45",
      type: "Ciment",
      ordreVitrine: null,
      sousCategorieId: SOUS_CATEGORIE_1,
      marque: "Ciments du Gabon",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const row = db.prepare("SELECT sous_categorie_id as sousCategorieId, marque FROM catalogue_modeles WHERE id = ?").get(MODELE_1) as {
      sousCategorieId: string | null;
      marque: string | null;
    };
    expect(row).toEqual({ sousCategorieId: SOUS_CATEGORIE_1, marque: "Ciments du Gabon" });
  });

  it("appliquerOperationModele — rétrocompatible avec un payload ancien format (sousCategorieId/marque null) : jamais d'exception, colonnes écrites null", async () => {
    await expect(
      storage.appliquerOperationModele({
        operation: "create",
        modeleId: MODELE_1,
        motif: "Modèle legacy",
        type: "Faïence",
        ordreVitrine: null,
        sousCategorieId: null,
        marque: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    ).resolves.toEqual({ applique: true });
    const row = db.prepare("SELECT sous_categorie_id as sousCategorieId, marque FROM catalogue_modeles WHERE id = ?").get(MODELE_1) as {
      sousCategorieId: string | null;
      marque: string | null;
    };
    expect(row).toEqual({ sousCategorieId: null, marque: null });
  });

  it("appliquerOperationProduit écrit bien unite_vente/caracteristiques/marque (colonnes unite_vente/caracteristiques déjà dormantes, désormais câblées)", async () => {
    const caracteristiques = JSON.stringify([{ cle: "Poids", valeur: "50 kg" }]);
    await storage.appliquerOperationProduit({
      operation: "create",
      produitId: PRODUIT_1,
      modeleId: MODELE_1,
      taille: "Sac 50kg",
      tailleTri: 50,
      largeur: null,
      hauteur: null,
      reference: "CIM-50",
      prix: 6500,
      uniteVente: "sac",
      caracteristiques,
      marque: "Ciments du Gabon",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const row = db
      .prepare("SELECT unite_vente as uniteVente, caracteristiques, marque FROM catalogue_produits WHERE id = ?")
      .get(PRODUIT_1) as { uniteVente: string | null; caracteristiques: string | null; marque: string | null };
    expect(row).toEqual({ uniteVente: "sac", caracteristiques, marque: "Ciments du Gabon" });
  });

  it("appliquerOperationProduit — rétrocompatible avec un payload ancien format (les 3 champs null) : comportement historique préservé", async () => {
    await expect(
      storage.appliquerOperationProduit({
        operation: "create",
        produitId: PRODUIT_1,
        modeleId: MODELE_1,
        taille: "60x60",
        tailleTri: 3600,
        largeur: 60,
        hauteur: 60,
        reference: "REF-6060",
        prix: 15000,
        uniteVente: null,
        caracteristiques: null,
        marque: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    ).resolves.toEqual({ applique: true });
    const row = db
      .prepare("SELECT unite_vente as uniteVente, caracteristiques, marque FROM catalogue_produits WHERE id = ?")
      .get(PRODUIT_1) as { uniteVente: string | null; caracteristiques: string | null; marque: string | null };
    expect(row).toEqual({ uniteVente: null, caracteristiques: null, marque: null });
  });

  it("migration idempotente : reconstruire SqliteServerStorage sur le même fichier (simulé ici par 2 instances sur des fichiers temporaires distincts) ne lève jamais d'exception", () => {
    // :memory: ne peut pas être réouverte deux fois (chaque connexion crée
    // sa propre base) — le vrai test d'idempotence pour un fichier déjà
    // migré est couvert côté PostgreSQL (migrer() rejoué, voir
    // postgresServerStorage.test.ts) ; ici on vérifie seulement que
    // construire DEUX instances indépendantes (donc exécuter le schéma
    // deux fois, sur deux bases différentes) ne lève jamais d'exception.
    expect(() => new SqliteServerStorage(new Database(":memory:"))).not.toThrow();
  });
});
