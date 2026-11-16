import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "../repositories/categorieRepository.js";
import { SousCategorieRepository } from "../repositories/sousCategorieRepository.js";
import { SousCategorieChampRepository } from "../repositories/sousCategorieChampRepository.js";
import { SousCategorieUniteRepository } from "../repositories/sousCategorieUniteRepository.js";
import { ModeleRepository } from "../repositories/modeleRepository.js";
import { ReferentielSyncService } from "./referentielSyncService.js";
import { SyncService } from "./syncService.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "../repositories/syncRepository.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.4 — simulation RÉELLE de
 * deux postes indépendants (test d'intégration obligatoire du lot).
 *
 * Chaque "poste" est une VRAIE base SQLite distincte (jamais un mock),
 * avec ses propres instances de repositories. Le réseau entre les deux
 * postes est simulé via `fetch` (même convention que tous les autres
 * tests de ce dossier) : ce que le Poste A "pousse" (forme exacte du
 * payload `enqueueSousCategorieSync`, déjà prouvée par
 * `metier.catalogSync.test.ts`) est exactement ce que le catch-up du
 * Poste B reçoit — la matérialisation RÉELLE côté serveur (projection
 * LWW, upsert idempotent) est déjà testée séparément et en profondeur
 * dans `packages/api` (`referentielPush.test.ts`, `referentielStore.test.ts`,
 * `postgresServerStorage.test.ts`) : ce fichier teste la convergence
 * RÉELLE du pipeline CLIENT (écriture locale Poste A → forme réseau →
 * écriture locale Poste B), pas une réimplémentation du serveur.
 */

function ouvrirPoste(): {
  db: Database.Database;
  categories: CategorieRepository;
  sousCategories: SousCategorieRepository;
  champs: SousCategorieChampRepository;
  unites: SousCategorieUniteRepository;
  modeles: ModeleRepository;
} {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return {
    db,
    categories: new CategorieRepository(db),
    sousCategories: new SousCategorieRepository(db),
    champs: new SousCategorieChampRepository(db),
    unites: new SousCategorieUniteRepository(db),
    modeles: new ModeleRepository(db),
  };
}

describe("Simulation deux postes indépendants — référentiel commun (Phase 5, sous-phase 5.4)", () => {
  let posteA: ReturnType<typeof ouvrirPoste>;
  let posteB: ReturnType<typeof ouvrirPoste>;

  beforeEach(() => {
    posteA = ouvrirPoste();
    posteB = ouvrirPoste();
    process.env["MAXI_EQUIP_API_URL"] = "https://api.test";
    process.env["MAXI_EQUIP_SYNC_JWT"] = "jeton-test";
  });

  afterEach(() => {
    posteA.db.close();
    posteB.db.close();
    vi.unstubAllGlobals();
    delete process.env["MAXI_EQUIP_API_URL"];
    delete process.env["MAXI_EQUIP_SYNC_JWT"];
  });

  it("Poste A crée une sous-catégorie AVEC sa configuration d'unités ; le catch-up du Poste B l'applique correctement, unités comprises", async () => {
    // --- Poste A : création locale réelle, catégorie puis sous-catégorie configurée. ---
    const catIdA = posteA.categories.create({ nom: "Ciments et liants" });
    const sousCatIdA = posteA.sousCategories.create({ categorieId: catIdA, nom: "Ciments en sac" });
    posteA.unites.definir(sousCatIdA, ["sac", "kg"]);
    const sousCatA = posteA.sousCategories.findById(sousCatIdA)!;
    const configA = posteA.unites.obtenirConfiguration(sousCatIdA);

    // --- "Réseau" : le serveur renvoie au Poste B exactement l'état de A (catégorie + sous-catégorie + unités en sous-objet).
    // Le cycle complet (executerSynchronisation) fait aussi un push/pull hérité AVANT les rattrapages — branché par URL,
    // même convention que syncService.test.ts (reponsePullVide). ---
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return Response.json({ results: [] });
        if (url.includes("/sync/pull")) return Response.json({ operations: [], cursor: 0 });
        return Response.json({
          categories: [{ id: catIdA, nom: "Ciments et liants", imageDataUrl: null, ordre: 0, updatedAt: sousCatA.updatedAt }],
          sousCategories: [
            {
              id: sousCatIdA,
              categorieId: catIdA,
              nom: sousCatA.nom,
              ordre: sousCatA.ordre,
              modelePhysique: sousCatA.modelePhysique,
              unitesAutorisees: configA.configuree ? configA.unites : null,
              updatedAt: sousCatA.updatedAt,
            },
          ],
          sousCategorieChamps: [],
        });
      })
    );

    // --- Poste B : catch-up réel (ReferentielSyncService + SyncService.executerSynchronisation, pas un appel direct aux repositories). ---
    const boiteEnvoiB = new BoiteEnvoiRepository(posteB.db);
    const syncRepoB = new SyncRepository(posteB.db);
    const serviceB = new SyncService(boiteEnvoiB, syncRepoB);
    serviceB.definirRattrapageReferentiel(posteB.categories, posteB.sousCategories, posteB.champs, new ReferentielSyncService());

    const resultat = await serviceB.executerSynchronisation();
    expect(resultat.success).toBe(true);

    // --- Vérifications sur le Poste B : même id, mêmes données, unités correctement appliquées. ---
    const categorieRecue = posteB.categories.findById(catIdA);
    expect(categorieRecue).toMatchObject({ id: catIdA, nom: "Ciments et liants" });

    const sousCatRecue = posteB.sousCategories.findById(sousCatIdA);
    expect(sousCatRecue).toMatchObject({ id: sousCatIdA, categorieId: catIdA, nom: "Ciments en sac" });

    const configB = posteB.unites.obtenirConfiguration(sousCatIdA);
    expect(configB).toEqual({ configuree: true, unites: ["kg", "sac"] });
  });

  it("scénario explicitement demandé : une sous-catégorie reçue AVANT sa catégorie parente n'est jamais appliquée dans l'immédiat, mais l'est correctement au cycle suivant une fois la catégorie connue", async () => {
    const catIdA = posteA.categories.create({ nom: "Peintures" });
    const sousCatIdA = posteA.sousCategories.create({ categorieId: catIdA, nom: "Peintures acryliques" });
    const sousCatA = posteA.sousCategories.findById(sousCatIdA)!;
    const catA = posteA.categories.findById(catIdA)!;

    const boiteEnvoiB = new BoiteEnvoiRepository(posteB.db);
    const syncRepoB = new SyncRepository(posteB.db);
    const serviceB = new SyncService(boiteEnvoiB, syncRepoB);
    serviceB.definirRattrapageReferentiel(posteB.categories, posteB.sousCategories, posteB.champs, new ReferentielSyncService());

    // --- Cycle 1 : le "réseau" ne renvoie (par hypothèse d'ordre défavorable) QUE la sous-catégorie, jamais sa catégorie. ---
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return Response.json({ results: [] });
        if (url.includes("/sync/pull")) return Response.json({ operations: [], cursor: 0 });
        return Response.json({
          categories: [],
          sousCategories: [
            { id: sousCatIdA, categorieId: catIdA, nom: sousCatA.nom, ordre: sousCatA.ordre, modelePhysique: null, unitesAutorisees: null, updatedAt: sousCatA.updatedAt },
          ],
          sousCategorieChamps: [],
        });
      })
    );
    const resultat1 = await serviceB.executerSynchronisation();
    expect(resultat1.success).toBe(true); // jamais un échec de toute la synchronisation pour cette seule dépendance manquante.
    expect(posteB.sousCategories.findById(sousCatIdA)).toBeNull(); // pas encore appliquée — categorie_id inconnue localement (FK).
    expect(posteB.categories.findById(catIdA)).toBeNull();

    // --- Cycle 2 : le "réseau" renvoie maintenant les deux (catégorie ET sous-catégorie) — comportement réel du catch-up intégral. ---
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return Response.json({ results: [] });
        if (url.includes("/sync/pull")) return Response.json({ operations: [], cursor: 0 });
        return Response.json({
          categories: [{ id: catIdA, nom: catA.nom, imageDataUrl: null, ordre: catA.ordre, updatedAt: catA.updatedAt }],
          sousCategories: [
            { id: sousCatIdA, categorieId: catIdA, nom: sousCatA.nom, ordre: sousCatA.ordre, modelePhysique: null, unitesAutorisees: null, updatedAt: sousCatA.updatedAt },
          ],
          sousCategorieChamps: [],
        });
      })
    );
    const resultat2 = await serviceB.executerSynchronisation();
    expect(resultat2.success).toBe(true);
    expect(posteB.categories.findById(catIdA)).toMatchObject({ nom: "Peintures" });
    expect(posteB.sousCategories.findById(sousCatIdA)).toMatchObject({ nom: "Peintures acryliques", categorieId: catIdA });
  });

  it("champ reçu dans le même catch-up que sa sous-catégorie : les deux sont appliqués (ordre catégorie → sous-catégorie → champ respecté par SyncService)", async () => {
    const catIdA = posteA.categories.create({ nom: "Plomberie" });
    const sousCatIdA = posteA.sousCategories.create({ categorieId: catIdA, nom: "Tuyaux" });
    const champIdA = posteA.champs.create({ sousCategorieId: sousCatIdA, nom: "Diamètre", type: "nombre", uniteMesure: "mm" });
    const champA = posteA.champs.listBySousCategorie(sousCatIdA).find((c) => c.id === champIdA)!;
    const sousCatA = posteA.sousCategories.findById(sousCatIdA)!;
    const catA = posteA.categories.findById(catIdA)!;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return Response.json({ results: [] });
        if (url.includes("/sync/pull")) return Response.json({ operations: [], cursor: 0 });
        return Response.json({
          categories: [{ id: catIdA, nom: catA.nom, imageDataUrl: null, ordre: catA.ordre, updatedAt: catA.updatedAt }],
          sousCategories: [
            { id: sousCatIdA, categorieId: catIdA, nom: sousCatA.nom, ordre: sousCatA.ordre, modelePhysique: null, unitesAutorisees: null, updatedAt: sousCatA.updatedAt },
          ],
          sousCategorieChamps: [
            {
              id: champIdA,
              sousCategorieId: sousCatIdA,
              nom: champA.nom,
              type: champA.type,
              obligatoire: champA.obligatoire,
              valeursAutorisees: champA.valeursAutorisees,
              uniteMesure: champA.uniteMesure,
              role: champA.role,
              ordre: champA.ordre,
              updatedAt: champA.updatedAt,
            },
          ],
        });
      })
    );

    const boiteEnvoiB = new BoiteEnvoiRepository(posteB.db);
    const syncRepoB = new SyncRepository(posteB.db);
    const serviceB = new SyncService(boiteEnvoiB, syncRepoB);
    serviceB.definirRattrapageReferentiel(posteB.categories, posteB.sousCategories, posteB.champs, new ReferentielSyncService());

    const resultat = await serviceB.executerSynchronisation();
    expect(resultat.success).toBe(true);
    expect(posteB.champs.listBySousCategorie(sousCatIdA).map((c) => c.id)).toContain(champIdA);
    expect(posteB.champs.listBySousCategorie(sousCatIdA).find((c) => c.id === champIdA)).toMatchObject({ nom: "Diamètre", type: "nombre", uniteMesure: "mm" });
  });
});

describe("Phase 5 (référentiel commun), sous-phase 5.6 — suppressions reçues avec dépendance locale (test d'intégration obligatoire)", () => {
  let posteA: ReturnType<typeof ouvrirPoste>;
  let posteB: ReturnType<typeof ouvrirPoste>;

  beforeEach(() => {
    posteA = ouvrirPoste();
    posteB = ouvrirPoste();
    process.env["MAXI_EQUIP_API_URL"] = "https://api.test";
    process.env["MAXI_EQUIP_SYNC_JWT"] = "jeton-test";
  });

  afterEach(() => {
    posteA.db.close();
    posteB.db.close();
    vi.unstubAllGlobals();
    delete process.env["MAXI_EQUIP_API_URL"];
    delete process.env["MAXI_EQUIP_SYNC_JWT"];
  });

  it("Scénario 7 + test d'intégration obligatoire — Poste A supprime une sous-catégorie SANS modèle actif (sur A) ; Poste B, qui possède localement un modèle référençant cette sous-catégorie, rattrape : tombstone appliqué sur B, le modèle reste intact, aucune garde locale ne bloque, aucune exception, le badge est correctement calculé", async () => {
    // --- Poste A : la sous-catégorie existe, SANS modèle actif sur A — la garde bloquante (mécanisme A) autorise donc sa suppression. ---
    const catIdA = posteA.categories.create({ nom: "Carrelage" });
    const sousCatIdA = posteA.sousCategories.create({ categorieId: catIdA, nom: "Carreaux" });
    expect(posteA.modeles.existeModeleActifPourSousCategorie(sousCatIdA)).toBe(false);
    posteA.sousCategories.softDelete(sousCatIdA, "user-a");
    const sousCatSupprimeeA = posteA.sousCategories.findById(sousCatIdA)!;
    const catA = posteA.categories.findById(catIdA)!;

    // --- Poste B : possède DÉJÀ localement un modèle actif qui référence cette même sous-catégorie (créé avant la suppression sur A, jamais synchronisé lui-même). ---
    posteB.categories.creerDepuisServeur({ id: catIdA, nom: catA.nom, imageDataUrl: null, ordre: catA.ordre, updatedAt: catA.updatedAt });
    posteB.sousCategories.creerDepuisServeur(
      { id: sousCatIdA, categorieId: catIdA, nom: "Carreaux", ordre: 0, modelePhysique: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      null
    );
    const modeleIdB = posteB.modeles.create({ motif: "Marbre Blanc", type: "Faïence", sousCategorieId: sousCatIdA });

    // --- "Réseau" : le serveur renvoie à B le tombstone matérialisé par A. ---
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return Response.json({ results: [] });
        if (url.includes("/sync/pull")) return Response.json({ operations: [], cursor: 0 });
        return Response.json({
          categories: [],
          sousCategories: [
            {
              id: sousCatIdA,
              categorieId: catIdA,
              nom: sousCatSupprimeeA.nom,
              ordre: sousCatSupprimeeA.ordre,
              modelePhysique: sousCatSupprimeeA.modelePhysique,
              unitesAutorisees: null,
              updatedAt: sousCatSupprimeeA.updatedAt,
              deletedAt: sousCatSupprimeeA.deletedAt,
            },
          ],
          sousCategorieChamps: [],
        });
      })
    );

    const boiteEnvoiB = new BoiteEnvoiRepository(posteB.db);
    const syncRepoB = new SyncRepository(posteB.db);
    const serviceB = new SyncService(boiteEnvoiB, syncRepoB);
    serviceB.definirRattrapageReferentiel(posteB.categories, posteB.sousCategories, posteB.champs, new ReferentielSyncService());

    // --- Aucune exception n'est levée (y compris par la garde bloquante : creerDepuisServeur n'est jamais soumis à `existeModeleActifPourSousCategorie`, réservée aux suppressions LOCALES). ---
    await expect(serviceB.executerSynchronisation()).resolves.toMatchObject({ success: true });

    // --- Le tombstone est bien appliqué sur B. ---
    const sousCatB = posteB.sousCategories.findById(sousCatIdA);
    expect(sousCatB).not.toBeNull();
    expect(sousCatB!.deletedAt).not.toBeNull();

    // --- Le modèle local de B reste ENTIÈREMENT intact — aucune cascade. ---
    const modeleB = posteB.modeles.findById(modeleIdB);
    expect(modeleB).not.toBeNull();
    expect(modeleB!.deletedAt).toBeNull();
    expect(modeleB!.sousCategorieId).toBe(sousCatIdA);

    // --- Le badge de classification orpheline est correctement calculé et visible. ---
    const modelesAvecStatut = posteB.modeles.listAvecStatutClassification();
    const ligne = modelesAvecStatut.find((m) => m.id === modeleIdB);
    expect(ligne).toBeDefined();
    expect(ligne!.sousCategorieSupprimee).toBe(true);
    expect(ligne!.categorieSupprimee).toBe(false);
  });
});
