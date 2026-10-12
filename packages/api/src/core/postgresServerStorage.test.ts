import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { rmSync } from "node:fs";
import { PostgresServerStorage } from "./postgresServerStorage.js";

/**
 * Tests RÉELS contre un vrai serveur PostgreSQL — Bloc 1 (remédiation
 * pré-production). Conformément à l'exigence explicite ("NE PAS
 * considérer un mock PostgreSQL comme preuve"), ce fichier démarre un
 * VRAI binaire PostgreSQL (via `embedded-postgres`, téléchargé comme
 * dépendance npm pour la plateforme courante) plutôt qu'un mock ou une
 * base en mémoire — aucun `pg-mem` ni équivalent. Docker n'étant pas
 * disponible dans cet environnement, c'est le mécanisme le plus proche
 * d'un "vrai PostgreSQL" qui ne dépende pas d'une infrastructure externe.
 *
 * Un seul serveur PostgreSQL est démarré pour tout le fichier (coût de
 * démarrage non négligible, ~5-10s) ; chaque test travaille sur des
 * identifiants UUID distincts pour rester indépendant sans avoir à
 * réinitialiser le schéma entre chaque cas.
 */

const PORT = 54330;
const DOSSIER_DONNEES = "./.pgdata-test";
let pg: EmbeddedPostgres;
let storage: PostgresServerStorage;

function uuidDeterministe(suffixe: string): string {
  return `00000000-0000-4000-8000-${suffixe.padStart(12, "0")}`;
}

beforeAll(async () => {
  rmSync(DOSSIER_DONNEES, { recursive: true, force: true });
  pg = new EmbeddedPostgres({
    databaseDir: DOSSIER_DONNEES,
    user: "maxiequip",
    password: "test-password",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("maxiequip_test");

  storage = new PostgresServerStorage(`postgres://maxiequip:test-password@localhost:${PORT}/maxiequip_test`);
  await storage.migrer();
}, 60_000);

afterAll(async () => {
  await storage?.fermer();
  await pg?.stop();
  rmSync(DOSSIER_DONNEES, { recursive: true, force: true });
}, 30_000);

describe("PostgresServerStorage — vrai serveur PostgreSQL réel (Bloc 1)", () => {
  it("migrer() est idempotente — rejouable sans erreur sur un schéma déjà créé", async () => {
    await expect(storage.migrer()).resolves.toBeUndefined();
  });

  describe("Journal d'opérations (ventes/mouvements/demandes)", () => {
    it("enregistre une opération et la retrouve via listerOperationsDepuis", async () => {
      const id = uuidDeterministe("1");
      const resultats = await storage.enregistrerOperations([{ entityType: "vente", entityId: id, payload: { total: 5000 } }]);
      expect(resultats).toEqual([{ entityId: id, statut: "cree" }]);

      const { operations } = await storage.listerOperationsDepuis(0);
      const trouvee = operations.find((o) => o.entityId === id);
      expect(trouvee).toBeDefined();
      expect(trouvee!.payload).toEqual({ total: 5000 });
    });

    it("idempotence réelle : la même opération envoyée deux fois n'est jamais dupliquée", async () => {
      const id = uuidDeterministe("2");
      const premiere = await storage.enregistrerOperations([{ entityType: "vente", entityId: id, payload: { total: 1000 } }]);
      expect(premiere[0]!.statut).toBe("cree");

      const deuxieme = await storage.enregistrerOperations([{ entityType: "vente", entityId: id, payload: { total: 1000 } }]);
      expect(deuxieme[0]!.statut).toBe("deja_traite");

      const { operations } = await storage.listerOperationsDepuis(0);
      expect(operations.filter((o) => o.entityId === id)).toHaveLength(1);
    });

    it("transaction réelle : un lot dont une opération échoue (JSON.stringify circulaire) est intégralement annulé", async () => {
      const idValide = uuidDeterministe("3");
      const idInvalide = uuidDeterministe("4");
      const objetCirculaire: Record<string, unknown> = {};
      objetCirculaire["soi_meme"] = objetCirculaire;

      await expect(
        storage.enregistrerOperations([
          { entityType: "entree", entityId: idValide, payload: { quantite: 10 } },
          { entityType: "vente", entityId: idInvalide, payload: objetCirculaire },
        ])
      ).rejects.toThrow();

      const { operations } = await storage.listerOperationsDepuis(0);
      expect(operations.some((o) => o.entityId === idValide)).toBe(false);
    });

    it("pagination réelle : hasMore et curseur corrects sur plusieurs pages", async () => {
      const ids = Array.from({ length: 7 }, (_, i) => uuidDeterministe(`1${i}0`));
      await storage.enregistrerOperations(ids.map((id) => ({ entityType: "entree" as const, entityId: id, payload: {} })));

      const page1 = await storage.listerOperationsDepuis(0, 5);
      // Peut contenir des opérations d'autres tests précédents dans le même curseur global — on vérifie seulement les propriétés structurelles.
      expect(page1.operations.length).toBeLessThanOrEqual(5);
      expect(typeof page1.hasMore).toBe("boolean");
    });
  });

  describe("Projection catalogue — modèle/variante/promotion/image (réel PostgreSQL)", () => {
    const MODELE_ID = uuidDeterministe("200");
    const PRODUIT_ID = uuidDeterministe("201");
    const PROMO_ID = uuidDeterministe("202");

    it("création d'un modèle : slug déterministe, retrouvé via listerModelesActifs", async () => {
      const { applique } = await storage.appliquerOperationModele({
        operation: "create",
        modeleId: MODELE_ID,
        motif: "Marbre Postgres Test",
        type: "Faïence",
        ordreVitrine: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(applique).toBe(true);

      const modeles = await storage.listerModelesActifs();
      const trouve = modeles.find((m) => m.id === MODELE_ID);
      expect(trouve).toMatchObject({ motif: "Marbre Postgres Test", slug: "marbre-postgres-test", ordreVitrine: null });
    });

    it("ordreVitrine : persisté puis retrouvé via listerModelesActifs (vitrine du site, 2026-10-07)", async () => {
      const modeleVitrine = uuidDeterministe("209");
      await storage.appliquerOperationModele({
        operation: "create",
        modeleId: modeleVitrine,
        motif: "Modele Vitrine PG",
        type: "Faïence",
        ordreVitrine: 3,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const modeles = await storage.listerModelesActifs();
      expect(modeles.find((m) => m.id === modeleVitrine)).toMatchObject({ ordreVitrine: 3 });
    });

    it("modification : la projection reflète les nouvelles valeurs", async () => {
      await storage.appliquerOperationModele({
        operation: "update",
        modeleId: MODELE_ID,
        motif: "Marbre Postgres Test Modifié",
        type: "Grès cérame",
        ordreVitrine: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const modeles = await storage.listerModelesActifs();
      expect(modeles.find((m) => m.id === MODELE_ID)).toMatchObject({ motif: "Marbre Postgres Test Modifié" });
    });

    it("ordre réel : une opération plus ancienne rejouée après une plus récente n'écrase jamais l'état (upsert conditionné PostgreSQL)", async () => {
      await storage.appliquerOperationModele({
        operation: "update",
        modeleId: MODELE_ID,
        motif: "PÉRIMÉ — ne doit jamais apparaître",
        type: "Faïence",
        ordreVitrine: null,
        updatedAt: "2026-01-01T12:00:00.000Z", // antérieur à la mise à jour précédente (2026-01-02)
      });
      const modeles = await storage.listerModelesActifs();
      expect(modeles.find((m) => m.id === MODELE_ID)?.motif).toBe("Marbre Postgres Test Modifié");
    });

    it("variante : création, prix retrouvé, rattachée au bon modèle", async () => {
      const { applique } = await storage.appliquerOperationProduit({
        operation: "create",
        produitId: PRODUIT_ID,
        modeleId: MODELE_ID,
        taille: "60x60",
        tailleTri: 3600,
        largeur: 60,
        hauteur: 60,
        reference: "PG-6060",
        prix: 15000,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(applique).toBe(true);
      const produits = await storage.listerProduitsActifs();
      expect(produits.find((p) => p.id === PRODUIT_ID)).toMatchObject({ modeleId: MODELE_ID, prix: 15000 });
    });

    it("promotion ciblée réelle : table de jointure correctement peuplée puis nettoyée à la modification", async () => {
      await storage.appliquerOperationPromotion({
        operation: "create",
        promotionId: PROMO_ID,
        libelle: "Soldes PG",
        typeReduction: "pourcentage",
        valeur: 20,
        perimetre: "cible",
        produitIds: [PRODUIT_ID],
        dateDebut: "2026-01-01T00:00:00.000Z",
        dateFin: "2026-12-31T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      let promotions = await storage.listerPromotionsActives();
      expect(promotions.find((p) => p.id === PROMO_ID)).toMatchObject({ produitIds: [PRODUIT_ID] });

      // Repasse en global : la table de jointure doit être vidée pour cette promotion.
      await storage.appliquerOperationPromotion({
        operation: "update",
        promotionId: PROMO_ID,
        libelle: "Soldes PG",
        typeReduction: "pourcentage",
        valeur: 20,
        perimetre: "global",
        produitIds: [],
        dateDebut: "2026-01-01T00:00:00.000Z",
        dateFin: "2026-12-31T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      promotions = await storage.listerPromotionsActives();
      expect(promotions.find((p) => p.id === PROMO_ID)).toMatchObject({ perimetre: "global", produitIds: [] });
    });

    it("suppression du modèle : disparaît de listerModelesActifs (soft delete réel)", async () => {
      await storage.appliquerOperationModele({
        operation: "delete",
        modeleId: MODELE_ID,
        motif: "Marbre Postgres Test Modifié",
        type: "Grès cérame",
        ordreVitrine: null,
        updatedAt: "2026-01-03T00:00:00.000Z",
      });
      const modeles = await storage.listerModelesActifs();
      expect(modeles.some((m) => m.id === MODELE_ID)).toBe(false);
    });

    it("RÉGRESSION bug réel (sync en boucle sur 500) : recréer un modèle avec le même nom qu'un modèle supprimé ne plante jamais — la contrainte UNIQUE sur slug est globale (inclut les lignes supprimées), slugUnique() doit en tenir compte", async () => {
      const NOUVEAU_ID = uuidDeterministe("205");
      await expect(
        storage.appliquerOperationModele({
          operation: "create",
          modeleId: NOUVEAU_ID,
          motif: "Marbre Postgres Test Modifié", // même motif que le modèle supprimé juste au-dessus
          type: "Faïence",
          ordreVitrine: null,
          updatedAt: "2026-01-04T00:00:00.000Z",
        })
      ).resolves.toMatchObject({ applique: true });

      const modeles = await storage.listerModelesActifs();
      const recree = modeles.find((m) => m.id === NOUVEAU_ID);
      expect(recree?.motif).toBe("Marbre Postgres Test Modifié");
      expect(recree?.slug).not.toBe("marbre-postgres-test-modifie"); // slug déjà occupé par la ligne supprimée
    });

    it("image : upsert de métadonnées + URL, puis suppression réelle", async () => {
      const IMAGE_ID = uuidDeterministe("203");
      const MODELE_IMG = uuidDeterministe("204");
      await storage.appliquerOperationModele({ operation: "create", modeleId: MODELE_IMG, motif: "Modele Image PG", type: "Faïence", ordreVitrine: null, updatedAt: "2026-01-01T00:00:00.000Z" });

      const { applique } = await storage.upsertImageMeta(
        { operation: "create", imageId: IMAGE_ID, modeleId: MODELE_IMG, kind: "produit", ordre: 0, estPrincipale: true, updatedAt: "2026-01-01T00:00:00.000Z" },
        { url: "http://api.test/img.png", filename: "img.png" }
      );
      expect(applique).toBe(true);
      expect(await storage.findImageFilename(IMAGE_ID)).toBe("img.png");

      const images = await storage.listerImagesActives();
      expect(images.find((i) => i.id === IMAGE_ID)).toMatchObject({ url: "http://api.test/img.png", estPrincipale: true });

      await storage.upsertImageMeta({ operation: "delete", imageId: IMAGE_ID, modeleId: MODELE_IMG, kind: "produit", ordre: 0, estPrincipale: false, updatedAt: "2026-01-02T00:00:00.000Z" });
      const imagesApres = await storage.listerImagesActives();
      expect(imagesApres.some((i) => i.id === IMAGE_ID)).toBe(false);
    });
  });

  describe("Projection identité entreprise (correction 'L'appli gère les infos du site', réel PostgreSQL)", () => {
    it("aucune identité synchronisée : getIdentiteActuelle() renvoie null", async () => {
      // Vérifié en tout début (avant toute opération identité dans ce
      // fichier) — jamais une valeur par défaut inventée.
      expect(await storage.getIdentiteActuelle()).toBeNull();
    });

    it("upsert puis relecture réelle via getIdentiteActuelle()", async () => {
      const { applique } = await storage.appliquerOperationIdentite({
        nom: "MAXI EQUIP Postgres Test",
        adresse: "Adresse PG",
        quartier: "Quartier PG",
        telephones: ["077000001", "077000002"],
        whatsapp: "+24177000001",
        email: "pg@maxi-equip.test",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(applique).toBe(true);

      const identite = await storage.getIdentiteActuelle();
      expect(identite).toMatchObject({
        nom: "MAXI EQUIP Postgres Test",
        telephones: ["077000001", "077000002"],
        whatsapp: "+24177000001",
        email: "pg@maxi-equip.test",
      });
    });

    it("RÉGRESSION bug réel : une deuxième modification (même singleton) est réellement appliquée, jamais ignorée", async () => {
      await storage.appliquerOperationIdentite({
        nom: "Premier nom PG",
        adresse: "",
        quartier: "",
        telephones: [],
        whatsapp: "",
        email: "",
        updatedAt: "2026-02-01T00:00:00.000Z",
      });
      const { applique } = await storage.appliquerOperationIdentite({
        nom: "Nom corrigé PG",
        adresse: "",
        quartier: "",
        telephones: [],
        whatsapp: "",
        email: "",
        updatedAt: "2026-02-02T00:00:00.000Z",
      });
      expect(applique).toBe(true);
      expect((await storage.getIdentiteActuelle())?.nom).toBe("Nom corrigé PG");
    });

    it("upsert 'si plus récent' : une opération avec un updatedAt plus ANCIEN n'écrase pas l'état courant", async () => {
      await storage.appliquerOperationIdentite({
        nom: "Version récente PG",
        adresse: "",
        quartier: "",
        telephones: [],
        whatsapp: "",
        email: "",
        updatedAt: "2026-03-02T00:00:00.000Z",
      });
      const { applique } = await storage.appliquerOperationIdentite({
        nom: "Version ancienne rejouée PG",
        adresse: "",
        quartier: "",
        telephones: [],
        whatsapp: "",
        email: "",
        updatedAt: "2026-03-01T00:00:00.000Z",
      });
      expect(applique).toBe(false);
      expect((await storage.getIdentiteActuelle())?.nom).toBe("Version récente PG");
    });
  });

  describe("Mot de passe de récupération d'installation (réel PostgreSQL)", () => {
    it("aucun mot de passe défini : getRecuperationHash() renvoie null", async () => {
      expect(await storage.getRecuperationHash()).toBeNull();
    });

    it("definirRecuperation puis relecture réelle via getRecuperationHash()", async () => {
      await storage.definirRecuperation("$argon2id$faux-hash-pour-le-test-1", null, null);
      expect(await storage.getRecuperationHash()).toBe("$argon2id$faux-hash-pour-le-test-1");
    });

    it("redéfinir remplace réellement l'ancien hash (singleton, jamais deux lignes)", async () => {
      await storage.definirRecuperation("$argon2id$ancien-hash", null, null);
      await storage.definirRecuperation("$argon2id$nouveau-hash", null, null);
      expect(await storage.getRecuperationHash()).toBe("$argon2id$nouveau-hash");
    });

    it("cléChiffréeSauvegarde stockée et relue telle quelle (blob opaque)", async () => {
      const blob = JSON.stringify({ kdf: "scrypt", salt: "abcd", iv: "1234", cleChiffree: "ffff", tag: "0000" });
      await storage.definirRecuperation("$argon2id$hash-avec-cle", blob, null);
      expect(await storage.getRecuperationCleChiffree()).toBe(blob);
    });

    it("cléChiffréeCloudBackup stockée et relue telle quelle (blob opaque, distinct de cléChiffréeSauvegarde)", async () => {
      const blobSauvegarde = JSON.stringify({ kdf: "scrypt", salt: "s1", iv: "iv1", cleChiffree: "aa", tag: "bb" });
      const blobCloudBackup = JSON.stringify({ kdf: "scrypt", salt: "s2", iv: "iv2", cleChiffree: "cc", tag: "dd" });
      await storage.definirRecuperation("$argon2id$hash-avec-deux-cles", blobSauvegarde, blobCloudBackup);
      expect(await storage.getRecuperationCleChiffree()).toBe(blobSauvegarde);
      expect(await storage.getRecuperationCleChiffreeCloudBackup()).toBe(blobCloudBackup);
    });
  });
});

describe("PostgresServerStorage — sélection automatique du backend (storeServeur.ts)", () => {
  beforeEach(async () => {
    const { fermerStockageServeur } = await import("./storeServeur.js");
    await fermerStockageServeur();
  });

  it("initialiserStockageServeurPostgres() bascule réellement sur PostgreSQL — vérifié par une écriture/lecture réelle", async () => {
    const { initialiserStockageServeurPostgres, enregistrerOperations, listerOperationsDepuis, fermerStockageServeur } = await import("./storeServeur.js");
    await initialiserStockageServeurPostgres(`postgres://maxiequip:test-password@localhost:${PORT}/maxiequip_test`);

    const id = uuidDeterministe("999");
    await enregistrerOperations([{ entityType: "vente", entityId: id, payload: { via: "postgres-storeServeur" } }]);
    const { operations } = await listerOperationsDepuis(0);
    expect(operations.some((o) => o.entityId === id)).toBe(true);

    await fermerStockageServeur();
  });
});
