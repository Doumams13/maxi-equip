import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { CategorieRepository } from "../repositories/categorieRepository.js";
import { SousCategorieRepository } from "../repositories/sousCategorieRepository.js";
import { SousCategorieChampRepository } from "../repositories/sousCategorieChampRepository.js";
import { SousCategorieUniteRepository } from "../repositories/sousCategorieUniteRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "../repositories/syncRepository.js";
import { SyncService } from "./syncService.js";
import { executerRattrapageProactifReferentiel } from "./referentielRattrapageProactif.js";
import { catalogue as domainCatalogue } from "@maxi-equip/domain";

/**
 * Phase 5 (référentiel commun), sous-phase 5.7 — rattrapage proactif du
 * référentiel local. Base réelle (jamais un mock de repository), vraie
 * transaction SQLite pour la preuve de non-exécution-partielle.
 */

function ouvrirPoste(): {
  db: Database.Database;
  categories: CategorieRepository;
  sousCategories: SousCategorieRepository;
  champs: SousCategorieChampRepository;
  unites: SousCategorieUniteRepository;
  boiteEnvoi: BoiteEnvoiRepository;
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
    boiteEnvoi: new BoiteEnvoiRepository(db),
  };
}

describe("executerRattrapageProactifReferentiel — Phase 5 (référentiel commun), sous-phase 5.7", () => {
  let poste: ReturnType<typeof ouvrirPoste>;

  beforeEach(() => {
    poste = ouvrirPoste();
  });

  afterEach(() => {
    poste.db.close();
  });

  it("1 — un référentiel local non vide crée les entrées correspondantes dans boite_envoi pour les 3 types", () => {
    // `runMigrations` seed déjà 15 catégories prédéfinies avec leurs sous-catégories (voir CATEGORIES_QUINCAILLERIE_PREDEFINIES) — un référentiel local "non vide" par construction, sans rien créer manuellement ici.
    const champId = poste.champs.create({ sousCategorieId: poste.sousCategories.list()[0]!.id, nom: "Champ de test" });

    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);

    expect(poste.boiteEnvoi.existeEntreePourType("categorie")).toBe(true);
    expect(poste.boiteEnvoi.existeEntreePourType("sous_categorie")).toBe(true);
    expect(poste.boiteEnvoi.existeEntreePourType("sous_categorie_champ")).toBe(true);

    const nbCategoriesLocales = poste.categories.list().length;
    const nbSousCategoriesLocales = poste.sousCategories.list().length;
    const nbCategoriesEnfilees = poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'categorie'").get() as { n: number };
    const nbSousCategoriesEnfilees = poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'sous_categorie'").get() as { n: number };
    const nbChampsEnfiles = poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'sous_categorie_champ'").get() as { n: number };

    expect(nbCategoriesEnfilees.n).toBe(nbCategoriesLocales);
    expect(nbSousCategoriesEnfilees.n).toBe(nbSousCategoriesLocales);
    expect(nbChampsEnfiles.n).toBeGreaterThanOrEqual(1);
    const champPayload = JSON.parse(
      (poste.db.prepare("SELECT payload_json FROM boite_envoi WHERE entity_type = 'sous_categorie_champ' AND entity_id = ?").get(champId) as { payload_json: string })
        .payload_json
    ) as { champId: string };
    expect(champPayload.champId).toBe(champId);
  });

  it("2 — les trois types possèdent des gardes STRICTEMENT indépendantes : une entrée 'categorie' préexistante ne bloque jamais le rattrapage des sous-catégories ni des champs", () => {
    // Simule un rattrapage "catégorie" déjà entamé (une seule entrée, peu importe son statut) AVANT d'exécuter le mécanisme complet.
    const catTest = poste.categories.create({ nom: "Déjà rattrapée" });
    poste.boiteEnvoi.creer("categorie", catTest, { operation: "create", categorieId: catTest, nom: "Déjà rattrapée", imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" });
    const nbCategoriesEnfileesAvant = (poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'categorie'").get() as { n: number }).n;

    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);

    // La garde "categorie" était déjà vraie : AUCUNE nouvelle entrée categorie déposée.
    const nbCategoriesEnfileesApres = (poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'categorie'").get() as { n: number }).n;
    expect(nbCategoriesEnfileesApres).toBe(nbCategoriesEnfileesAvant);
    // Mais sous-catégories ET champs, jamais encore rattrapés, le sont bien malgré tout — gardes indépendantes
    // (la migration seed aussi des champs suggérés prédéfinis — CHAMPS_SUGGERES_QUINCAILLERIE_PREDEFINIS, voir migrate.ts).
    expect(poste.boiteEnvoi.existeEntreePourType("sous_categorie")).toBe(true);
    expect(poste.boiteEnvoi.existeEntreePourType("sous_categorie_champ")).toBe(true);
  });

  it("3 — la configuration d'unités autorisées est bien présente dans le payload des sous-catégories concernées, construite EXACTEMENT comme une modification normale", () => {
    const sousCatId = poste.sousCategories.list()[0]!.id;
    poste.unites.definir(sousCatId, ["sac", "kg"]);

    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);

    const row = poste.db.prepare("SELECT payload_json FROM boite_envoi WHERE entity_type = 'sous_categorie' AND entity_id = ?").get(sousCatId) as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as { unitesAutorisees: string[] | null };
    expect(payload.unitesAutorisees).toEqual(["kg", "sac"]);

    // Une sous-catégorie SANS configuration explicite transmet bien `null` (jamais un tableau vide).
    const autreSousCatId = poste.sousCategories.list().find((s) => s.id !== sousCatId)!.id;
    const rowAutre = poste.db.prepare("SELECT payload_json FROM boite_envoi WHERE entity_type = 'sous_categorie' AND entity_id = ?").get(autreSousCatId) as { payload_json: string };
    const payloadAutre = JSON.parse(rowAutre.payload_json) as { unitesAutorisees: string[] | null };
    expect(payloadAutre.unitesAutorisees).toBeNull();
  });

  it("4 — les champs possèdent toutes leurs propriétés nécessaires à la synchronisation dans leur payload", () => {
    const sousCatId = poste.sousCategories.list()[0]!.id;
    const champId = poste.champs.create({
      sousCategorieId: sousCatId,
      nom: "Diamètre",
      type: "nombre",
      obligatoire: true,
      uniteMesure: "mm",
      role: "physique",
    });

    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);

    const row = poste.db.prepare("SELECT payload_json FROM boite_envoi WHERE entity_type = 'sous_categorie_champ' AND entity_id = ?").get(champId) as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    expect(payload).toMatchObject({
      operation: "create",
      champId,
      sousCategorieId: sousCatId,
      nom: "Diamètre",
      type: "nombre",
      obligatoire: true,
      uniteMesure: "mm",
      role: "physique",
    });
  });

  it("5 — les identifiants d'origine sont préservés : jamais un nouvel id généré pour l'enfilage", () => {
    const catId = poste.categories.list()[0]!.id;
    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);

    const row = poste.db.prepare("SELECT entity_id, payload_json FROM boite_envoi WHERE entity_type = 'categorie' AND entity_id = ?").get(catId) as
      | { entity_id: string; payload_json: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.entity_id).toBe(catId);
    expect((JSON.parse(row!.payload_json) as { categorieId: string }).categorieId).toBe(catId);
  });

  it("6 — les entités supprimées (tombstonées) ne sont jamais réintroduites dans le rattrapage", () => {
    const catId = poste.categories.create({ nom: "À ne jamais rattraper" });
    poste.categories.softDelete(catId, "testeur");
    const sousCatId = poste.sousCategories.create({ categorieId: poste.categories.list()[0]!.id, nom: "Sous-cat à ne jamais rattraper" });
    poste.sousCategories.softDelete(sousCatId, "testeur");
    const champId = poste.champs.create({ sousCategorieId: poste.sousCategories.list()[0]!.id, nom: "Champ à ne jamais rattraper" });
    poste.champs.delete(champId, "testeur");

    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);

    expect(poste.boiteEnvoi.listerParEntite("categorie", catId)).toEqual([]);
    expect(poste.boiteEnvoi.listerParEntite("sous_categorie", sousCatId)).toEqual([]);
    expect(poste.boiteEnvoi.listerParEntite("sous_categorie_champ", champId)).toEqual([]);
  });

  it("7 — un deuxième démarrage ne relance jamais le rattrapage déjà effectué (idempotence totale, aucune entrée dupliquée)", () => {
    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);
    const totalApres1 = (poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi").get() as { n: number }).n;

    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);
    const totalApres2 = (poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi").get() as { n: number }).n;

    expect(totalApres2).toBe(totalApres1);
  });

  it("8 — une interruption au milieu d'un lot ne produit JAMAIS un état partiellement validé : rollback complet, retentable au prochain démarrage (preuve réelle, pas simulée)", () => {
    // Provoque un VRAI échec SQL au milieu de la boucle "sous_categorie" :
    // une violation de contrainte (categorie_id inexistante) déclenchée en
    // insérant directement une sous-catégorie orpheline, puis en forçant
    // `sousCategorieRepository.list()` à inclure une ligne dont la lecture
    // par `unites.obtenirConfiguration` échoue — plus simple et tout aussi
    // réel : on retire la catégorie parente APRÈS coup, invalidant la
    // clé étrangère au moment précis de l'enfilage (la FK est vérifiée au
    // niveau de boite_envoi, qui n'a pas de contrainte vers sous_categories
    // — on provoque donc la violation directement via une contrainte
    // SQLite réelle : insérer une seconde fois le même id de catégorie
    // (PRIMARY KEY) au milieu du lot, via un trigger de test).
    poste.db.exec(`
      CREATE TRIGGER echec_test_milieu_lot
      AFTER INSERT ON boite_envoi
      WHEN (SELECT COUNT(*) FROM boite_envoi WHERE entity_type = 'sous_categorie') = 3
      BEGIN
        SELECT RAISE(ABORT, 'échec simulé au milieu du lot sous_categorie');
      END;
    `);

    expect(() => executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites)).toThrow();

    // La garde "sous_categorie" reste FAUSSE : rien n'a été validé (rollback complet de la transaction du lot), retentable au prochain démarrage.
    expect(poste.boiteEnvoi.existeEntreePourType("sous_categorie")).toBe(false);
    const nbSousCategoriesEnfilees = (poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'sous_categorie'").get() as { n: number }).n;
    expect(nbSousCategoriesEnfilees).toBe(0); // AUCUNE entrée partielle — jamais 2 ou 3 entrées orphelines.

    poste.db.exec("DROP TRIGGER echec_test_milieu_lot");
    // Retenté au prochain "démarrage" (garde toujours fausse) : réussit intégralement cette fois.
    executerRattrapageProactifReferentiel(poste.db, poste.boiteEnvoi, poste.categories, poste.sousCategories, poste.champs, poste.unites);
    expect(poste.boiteEnvoi.existeEntreePourType("sous_categorie")).toBe(true);
    expect((poste.db.prepare("SELECT COUNT(*) as n FROM boite_envoi WHERE entity_type = 'sous_categorie'").get() as { n: number }).n).toBe(poste.sousCategories.list().length);
  });
});

describe("Phase 5 (référentiel commun), sous-phase 5.7 — scénario réaliste à deux postes (catégories prédéfinies indépendantes)", () => {
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

  it("deux postes ayant chacun exécuté indépendamment la migration (catégories prédéfinies identiques, ids distincts) : après rattrapage + synchronisation des deux, les catégories restent DISTINCTES (aucune fusion), et le diagnostic les signale correctement", async () => {
    // --- Chaque poste a SA PROPRE occurrence de "Électricité" (seedée indépendamment par sa propre migration, ids distincts par construction — randomUUID()). ---
    const electriciteA = posteA.categories.list().find((c) => c.nom === "Électricité")!;
    const electriciteB = posteB.categories.list().find((c) => c.nom === "Électricité")!;
    expect(electriciteA.id).not.toBe(electriciteB.id);

    // --- Rattrapage proactif sur les DEUX postes. ---
    executerRattrapageProactifReferentiel(posteA.db, posteA.boiteEnvoi, posteA.categories, posteA.sousCategories, posteA.champs, posteA.unites);
    executerRattrapageProactifReferentiel(posteB.db, posteB.boiteEnvoi, posteB.categories, posteB.sousCategories, posteB.champs, posteB.unites);
    expect(posteA.boiteEnvoi.existeEntreePourType("categorie")).toBe(true);
    expect(posteB.boiteEnvoi.existeEntreePourType("categorie")).toBe(true);

    // --- Poste A pousse réellement son lot (capture de la requête HTTP réelle — "les opérations sont effectivement poussées"). ---
    let requeteRecueA: { categories: Array<{ categorieId: string; nom: string }> } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("/sync/push")) {
          const corps = JSON.parse(options!.body as string) as { operations: { entityType: string; payload: { categorieId: string; nom: string } }[] };
          requeteRecueA = { categories: corps.operations.filter((o) => o.entityType === "categorie").map((o) => o.payload) };
          return new Response(JSON.stringify({ results: corps.operations.map((o) => ({ entityId: o.payload.categorieId, statut: "cree" })) }), { status: 200 });
        }
        return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
      })
    );
    const syncRepoA = new SyncRepository(posteA.db);
    const serviceA = new SyncService(posteA.boiteEnvoi, syncRepoA);
    const resultatPushA = await serviceA.executerSynchronisation();
    expect(resultatPushA.success).toBe(true);
    expect(requeteRecueA).not.toBeNull();
    expect(requeteRecueA!.categories.some((c) => c.categorieId === electriciteA.id && c.nom === "Électricité")).toBe(true);
    vi.unstubAllGlobals();

    // --- "Serveur de test commun" : matérialise ce que A a réellement poussé (ids/noms exacts capturés ci-dessus, jamais inventés) — même principe assumé et documenté que referentielDeuxPostes.test.ts (packages/api n'est pas une dépendance d'electron-app ; la matérialisation réelle côté serveur LWW est déjà testée en profondeur dans packages/api). ---
    const toutesCategoriesPoussesParA = requeteRecueA!.categories;

    // --- Poste B rattrape le serveur (reçoit les catégories de A, EN PLUS des siennes déjà présentes localement). ---
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/sync/push")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        if (url.includes("/sync/pull")) return new Response(JSON.stringify({ operations: [], cursor: 0 }), { status: 200 });
        return new Response(
          JSON.stringify({
            categories: toutesCategoriesPoussesParA.map((c) => ({ id: c.categorieId, nom: c.nom, imageDataUrl: null, ordre: 0, updatedAt: "2026-01-01T00:00:00.000Z" })),
            sousCategories: [],
            sousCategorieChamps: [],
          }),
          { status: 200 }
        );
      })
    );
    const { ReferentielSyncService } = await import("./referentielSyncService.js");
    const syncRepoB = new SyncRepository(posteB.db);
    const serviceB = new SyncService(posteB.boiteEnvoi, syncRepoB);
    serviceB.definirRattrapageReferentiel(posteB.categories, posteB.sousCategories, posteB.champs, new ReferentielSyncService());
    const resultatB = await serviceB.executerSynchronisation();
    expect(resultatB.success).toBe(true);

    // --- Les catégories restent DISTINCTES : poste B a maintenant SA PROPRE "Électricité" (locale) ET celle de A (reçue), jamais fusionnées — deux ids différents, deux lignes. ---
    const electriciteSurB = posteB.categories.list().filter((c) => c.nom === "Électricité");
    expect(electriciteSurB.map((c) => c.id).sort()).toEqual([electriciteA.id, electriciteB.id].sort());
    expect(electriciteSurB).toHaveLength(2); // jamais une fusion automatique.

    // --- Le diagnostic, exécuté sur le référentiel désormais convergé du poste B, détecte correctement ce doublon prévisible. ---
    const groupes = domainCatalogue.detecterDoublonsPotentiels(posteB.categories.list());
    const groupeElectricite = groupes.find((g) => g.nom === "Électricité");
    expect(groupeElectricite).toBeDefined();
    expect(groupeElectricite!.occurrences.map((o) => o.id).sort()).toEqual([electriciteA.id, electriciteB.id].sort());
  });
});
