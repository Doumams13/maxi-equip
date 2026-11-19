import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
// Importé comme texte brut par le bundler (Vite/electron-vite) — voir electron.vite.config.ts.
import schemaSql from "./schema.sql?raw";

/**
 * Exécute schema.sql instruction par instruction plutôt qu'en un seul
 * `db.exec()` (bug réel reproduit et corrigé — Phase 6C, installation
 * indépendante) : sur une base déjà existante, "CREATE TABLE IF NOT
 * EXISTS" est un no-op si la table existe déjà sous une forme plus
 * ancienne — une ligne "CREATE INDEX ... ON <table> (<colonne_recente>)"
 * placée directement dans schema.sql échoue alors avec "no such column"
 * AVANT que la migration incrémentale correspondante (plus bas dans ce
 * fichier, qui ajoute la colonne puis crée l'index) n'ait la moindre
 * chance de s'exécuter — et comme `db.exec()` traite tout le fichier
 * comme un seul lot, cette unique ligne bloquait aussi la création de
 * TOUTES les tables suivantes dans le fichier, quelle que soit la table
 * concernée. Ce bug a déjà été rencontré une fois pour
 * `mouvements.utilisateur_id` (corrigé en retirant la ligne de
 * schema.sql) puis réapparu pour `produits.modele_id` — cette fonction
 * rend la classe entière de bug inoffensive, plutôt que de compter sur
 * la vigilance de ne plus jamais répéter l'erreur : une instruction
 * `CREATE INDEX`/`CREATE UNIQUE INDEX` qui échoue avec "no such column"
 * est ignorée (la migration incrémentale dédiée s'en chargera après
 * avoir garanti la colonne), tout le reste de schema.sql continue de
 * s'exécuter, et toute AUTRE erreur (jamais attendue) reste fatale
 * comme avant.
 */
// Exportée uniquement pour le test de régression dédié (vérifie le
// comportement général — "peu importe la table" — avec un schéma
// synthétique), jamais utilisée ailleurs que par `runMigrations` en
// production (toujours appelée sans second argument, sur le vrai
// schema.sql).
export function executerSchemaDeFaconTolerante(db: Database.Database, sql: string = schemaSql): void {
  const instructions = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const instruction of instructions) {
    try {
      db.exec(`${instruction};`);
    } catch (err) {
      const estCreationIndex = /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(instruction);
      const estColonneManquante = err instanceof Error && /no such column/i.test(err.message);
      if (estCreationIndex && estColonneManquante) continue;
      throw err;
    }
  }
}

/**
 * Ne renvoie, parmi `colonnesCibles`, que celles RÉELLEMENT présentes
 * dans `tableSource` au moment de l'appel (audit "check up complet") :
 * les migrations qui recréent une table (voir `fixReferenceUniqueConstraint`,
 * `migrateFacturesPourAnnulationEtLivraison`) copiaient jusqu'ici les
 * données vers une liste de colonnes CODÉE EN DUR, écrite au moment de
 * cette correction précise — toute colonne ajoutée PLUS TARD par une
 * autre migration n'y figurait jamais, et était donc silencieusement
 * perdue si cette recréation venait à s'exécuter après coup (même
 * classe de bug que celle déjà corrigée pour `schema.sql`/`modele_id` :
 * une hypothèse figée sur la forme de la table au lieu d'une vérification
 * réelle). En calculant l'intersection à l'exécution, ces migrations
 * conservent désormais AUTOMATIQUEMENT toute colonne déjà présente sur
 * la table source, quelle qu'elle soit et quelle que soit la date à
 * laquelle elle a été ajoutée — plus besoin de se souvenir de mettre à
 * jour une liste figée à chaque nouvelle colonne.
 */
function colonnesEnCommun(db: Database.Database, tableSource: string, colonnesCibles: string[]): string[] {
  const colonnesSource = new Set(
    (db.prepare(`PRAGMA table_info(${tableSource})`).all() as { name: string }[]).map((c) => c.name)
  );
  return colonnesCibles.filter((c) => colonnesSource.has(c));
}

/**
 * Applique le schéma initial (idempotent — CREATE TABLE IF NOT EXISTS),
 * puis les évolutions de schéma ultérieures, elles aussi idempotentes et
 * jamais destructrices (§14 du prompt Phase 0 : "ne détruit aucune donnée
 * existante").
 *
 * CORRECTION (audit "130 carreaux, 1 affiché", 2026-11-19) : renvoie
 * désormais les ids des modèles reclassés par balayage SQL brut
 * (`migrerCarrelageVersCategorieParDefautSiAbsent` /
 * `migrerModelesNonClassesVersDiversSiAbsent`) — ces deux migrations
 * modifient `modeles_produit.sous_categorie_id` directement en base,
 * jamais via `enqueueModeleSync` (boiteEnvoiRepository n'existe pas
 * encore à ce stade du démarrage, voir main/index.ts), donc ce
 * reclassement restait jusqu'ici purement local, sans jamais remonter au
 * serveur central ni aux autres postes. L'appelant (main/index.ts, une
 * fois boiteEnvoiRepository disponible) met ces ids en file de synchro.
 */
export function runMigrations(db: Database.Database): string[] {
  executerSchemaDeFaconTolerante(db);
  addEstPrincipaleColumnIfMissing(db);
  fixReferenceUniqueConstraint(db);
  addLargeurHauteurColumnsIfMissing(db);
  addActifColumnToEmplacementsIfMissing(db);
  addResponsablesColumnsIfMissing(db);
  createSyncTablesIfMissing(db);
  ajouterColonneAppliqueSyncRecuSiAbsente(db);
  addUtilisateurIdToMouvementsIfMissing(db);
  migrateFacturesPourAnnulationEtLivraison(db);
  seedParametresEntrepriseSiAbsent(db);
  migrerTelephoneUniqueVersTable(db);
  ajouterSourceEntityIdDemandesSiAbsent(db);
  creerTableSuiviDemandeSiAbsente(db);
  migrerAncienStatutContacteeSiPresent(db);
  retirerContrainteProduitIdLignesDemandeSiPresente(db);
  migrerTablePromotionsSiAncienSchema(db);
  ajouterColonnesPromoLignesFactureSiAbsentes(db);
  ajouterColonneReferenceLignesFactureSiAbsente(db);
  ajouterColonneRemiseFacturesSiAbsente(db);
  ajouterColonnesStatutPaiementFacturesSiAbsentes(db);
  ajouterColonnesAnnulationMouvementsSiAbsentes(db);
  // SCHEMA v6 — multi-format produits
  creerTableModelesProductsSiAbsente(db);
  ajouterModeleIdAuxProduitsSiAbsent(db);
  creerModelesPourProduitsExistants(db);
  migrerImagesVersModeles(db);
  ajouterIndexModeleIdProduitsSiAbsent(db);
  // Correction Phase Finale, Bloc 6 (audit pré-production)
  ajouterIdentiteSnapshotFacturesSiAbsente(db);
  ajouterOrdreVitrineModelesSiAbsent(db);
  ajouterCarreauxParCartonProduitsSiAbsent(db);
  ajouterSurfaceCartonLignesFactureSiAbsente(db);
  // Système multiposte fiable (2026-10-28)
  elargirTypeNotificationsEtAjouterOrigineSiAbsent(db);
  // Fondations quincaillerie (Phase 1)
  ajouterUniteVenteEtCaracteristiquesProduitsSiAbsent(db);
  ajouterUniteVenteEtCaracteristiquesLignesFactureSiAbsent(db);
  creerTablesCategoriesSiAbsentes(db);
  ajouterSousCategorieIdModelesSiAbsent(db);
  const idsCarreauxReclasses = migrerCarrelageVersCategorieParDefautSiAbsent(db);
  creerTableSousCategorieChampsSiAbsente(db);
  const idsDiversReclasses = migrerModelesNonClassesVersDiversSiAbsent(db);
  // Fondations quincaillerie (Phase 2)
  ajouterMarqueModelesSiAbsent(db);
  ajouterMarqueProduitsSiAbsent(db);
  // Initialisation du catalogue quincaillerie (2026-11-15)
  initialiserCategoriesQuincailleriePredefiniesSiAbsentes(db);
  // Fondations quincaillerie (Phase 3 bis)
  ajouterModelePhysiqueEtUnitesConfigureesSousCategoriesSiAbsent(db);
  marquerCarreauxCommeModelePhysiqueSiAbsent(db);
  creerTableSousCategorieUnitesSiAbsente(db);
  ajouterProprietesChampsSousCategorieSiAbsentes(db);
  // Phase 5 (référentiel commun), sous-phase 5.4 — prérequis de schéma
  // pour la RÉCEPTION d'un tombstone de champ depuis un autre poste
  // (voir SousCategorieChampRepository.creerDepuisServeur) : un champ
  // supprimé ailleurs doit pouvoir être marqué comme tel localement sans
  // jamais le supprimer physiquement (ce qui romprait l'upsert idempotent
  // "si plus récent"). Ne change RIEN au mécanisme de suppression LOCALE
  // (toujours un DELETE physique via `delete()`, réservé à la sous-phase
  // 5.6) — ces colonnes ne sont écrites ici que par le chemin de
  // réception, jamais par `delete()`.
  ajouterColonnesDeletedSousCategorieChampsSiAbsentes(db);
  // Nettoyage incident 2026-11-17 (doublons "(copie)") — ACTIVÉE (voir
  // `reaffecterModelesDepuisSousCategoriesCopieVersOriginalesSiPresentes`
  // ci-dessous pour le raisonnement complet).
  reaffecterModelesDepuisSousCategoriesCopieVersOriginalesSiPresentes(db);
  setSchemaVersion(db);
  return [...idsCarreauxReclasses, ...idsDiversReclasses];
}

/**
 * Correction Phase Finale, Bloc 6 : l'identité entreprise affichée sur
 * une facture (nom, adresse, quartier, téléphones, responsables
 * affichés) était jusqu'ici toujours relue EN DIRECT depuis
 * `parametres_entreprise` au moment de la génération/régénération du
 * PDF — jamais figée. Modifier les paramètres après une vente modifiait
 * donc l'apparence d'une facture déjà émise si son PDF était régénéré
 * plus tard. Colonne NULLABLE : les factures déjà émises avant cette
 * migration n'ont jamais eu cette information capturée à l'époque —
 * jamais une valeur inventée rétroactivement, la génération de PDF
 * retombe sur l'identité courante UNIQUEMENT pour ces factures-là (voir
 * ipc/metier.ts). Toute NOUVELLE vente, à partir de maintenant, capture
 * un instantané réel (voir venteService.ts).
 */
/**
 * Correction "choisir quels carreaux s'affichent en première page du
 * site" (2026-10-07) : avant cette colonne, la mosaïque d'accueil
 * n'avait aucun moyen de distinguer les modèles entre eux — avec un
 * catalogue volumineux, impossible de choisir manuellement lesquels
 * mettre en avant. `ordre_vitrine` NULL = non sélectionné, un nombre =
 * position d'affichage (0 = premier) — voir shared-types/produit.ts.
 */
function ajouterOrdreVitrineModelesSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(modeles_produit)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "ordre_vitrine")) {
    db.exec("ALTER TABLE modeles_produit ADD COLUMN ordre_vitrine INTEGER");
  }
}

/**
 * Correction "le prix de référence est au m², pas au carton" (2026-10-08)
 * — nombre de carreaux par carton, saisi manuellement par taille (varie
 * selon la taille, aucune formule universelle) — voir shared-types/produit.ts.
 */
function ajouterCarreauxParCartonProduitsSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "carreaux_par_carton")) {
    db.exec("ALTER TABLE produits ADD COLUMN carreaux_par_carton INTEGER");
  }
}

/**
 * Même correction — snapshot de la surface du carton (m²) sur chaque
 * ligne de facture, pour que le prix au m² affiché reste cohérent avec
 * le prix de carton réellement facturé (même négocié), sans jamais
 * recalculer depuis le produit actuel — voir shared-types/facture.ts.
 */
function ajouterSurfaceCartonLignesFactureSiAbsente(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(lignes_facture)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "surface_carton_m2")) {
    db.exec("ALTER TABLE lignes_facture ADD COLUMN surface_carton_m2 REAL");
  }
}

function ajouterIdentiteSnapshotFacturesSiAbsente(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(factures)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "identite_snapshot_json")) {
    db.exec("ALTER TABLE factures ADD COLUMN identite_snapshot_json TEXT");
  }
}

/**
 * Correction "Intégration Site Phase 5" — retire la contrainte de clé
 * étrangère `produit_id REFERENCES produits (id)` sur `lignes_demande`,
 * devenue incorrecte : une demande provient d'une source EXTERNE (le
 * site vitrine), dont le catalogue n'est jamais garanti d'être
 * synchronisé avec les identifiants réels de cette installation.
 * Vérifié réellement avant cette correction : une vraie tentative
 * d'ingestion avec un identifiant inconnu échouait avec
 * "FOREIGN KEY constraint failed", empêchant silencieusement toute
 * demande venant d'un catalogue non parfaitement aligné d'apparaître
 * dans l'application.
 *
 * SQLite ne permet pas de retirer une contrainte FOREIGN KEY par un
 * simple ALTER TABLE — recrée la table sans la contrainte, copie les
 * données existantes telles quelles (aucune perte), puis bascule.
 * Idempotente : ne s'exécute que si l'ancienne contrainte est encore
 * détectée dans le SQL de création de la table.
 */
function retirerContrainteProduitIdLignesDemandeSiPresente(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lignes_demande'").get() as { sql: string } | undefined;
  if (!row || !row.sql.includes("produit_id") || !row.sql.toUpperCase().includes("REFERENCES PRODUITS")) return;

  const executer = db.transaction(() => {
    db.exec(`
      CREATE TABLE lignes_demande_nouvelle (
        id               TEXT PRIMARY KEY,
        demande_id       TEXT NOT NULL REFERENCES demandes (id),
        produit_id       TEXT NOT NULL,
        motif            TEXT NOT NULL,
        taille           TEXT NOT NULL,
        quantite         INTEGER NOT NULL CHECK (quantite > 0),
        prix_indicatif   INTEGER NOT NULL
      );
    `);
    db.exec(`
      INSERT INTO lignes_demande_nouvelle (id, demande_id, produit_id, motif, taille, quantite, prix_indicatif)
      SELECT id, demande_id, produit_id, motif, taille, quantite, prix_indicatif FROM lignes_demande;
    `);
    db.exec("DROP TABLE lignes_demande;");
    db.exec("ALTER TABLE lignes_demande_nouvelle RENAME TO lignes_demande;");
  });
  executer();
}

/**
 * Système multiposte fiable (2026-10-28) — `notifications.type` porte un
 * CHECK figé à 'demande'|'stock'|'sync' (voir schema.sql) : SQLite ne
 * permet pas de l'élargir par un simple ALTER TABLE, même idiome
 * "recréer la table, copier, supprimer l'ancienne, renommer" que
 * `retirerContrainteProduitIdLignesDemandeSiPresente` ci-dessus.
 * `entity_type`/`entity_id`/`poste_id` ajoutées en même temps (toujours
 * NULL sur les notifications existantes — jamais une valeur inventée
 * rétroactivement, voir shared-types/demande.ts). Idempotente : ne
 * s'exécute que si `poste_id` est encore absente.
 */
function elargirTypeNotificationsEtAjouterOrigineSiAbsent(db: Database.Database): void {
  const colonnes = db.prepare("PRAGMA table_info(notifications)").all() as { name: string }[];
  if (colonnes.some((c) => c.name === "poste_id")) return;

  const executer = db.transaction(() => {
    db.exec(`
      CREATE TABLE notifications_nouvelle (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL CHECK (type IN ('demande', 'stock', 'sync', 'vente', 'entree', 'sortie', 'transfert')),
        titre       TEXT NOT NULL,
        message     TEXT NOT NULL,
        lue         INTEGER NOT NULL DEFAULT 0 CHECK (lue IN (0, 1)),
        demande_id  TEXT REFERENCES demandes (id),
        entity_type TEXT,
        entity_id   TEXT,
        poste_id    TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `);
    db.exec(`
      INSERT INTO notifications_nouvelle (id, type, titre, message, lue, demande_id, created_at, updated_at)
      SELECT id, type, titre, message, lue, demande_id, created_at, updated_at FROM notifications;
    `);
    db.exec("DROP TABLE notifications;");
    db.exec("ALTER TABLE notifications_nouvelle RENAME TO notifications;");
  });
  executer();
}

/**
 * Fondations quincaillerie (Phase 1) — NULL = "carton" (comportement
 * historique carreaux, voir shared-types/produit.ts, uniteVenteEffective()).
 */
function ajouterUniteVenteEtCaracteristiquesProduitsSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "unite_vente")) {
    db.exec("ALTER TABLE produits ADD COLUMN unite_vente TEXT");
  }
  if (!columns.some((c) => c.name === "caracteristiques")) {
    db.exec("ALTER TABLE produits ADD COLUMN caracteristiques TEXT");
  }
}

/** Même évolution — snapshot sur lignes_facture, même principe que surface_carton_m2 (voir ajouterSurfaceCartonLignesFactureSiAbsente). */
function ajouterUniteVenteEtCaracteristiquesLignesFactureSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(lignes_facture)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "unite_vente")) {
    db.exec("ALTER TABLE lignes_facture ADD COLUMN unite_vente TEXT");
  }
  if (!columns.some((c) => c.name === "caracteristiques")) {
    db.exec("ALTER TABLE lignes_facture ADD COLUMN caracteristiques TEXT");
  }
}

/**
 * Fondations quincaillerie (Phase 1) — `categories`/`sous_categories`
 * créées ici en plus de schema.sql (même raison que
 * `creerTableModelesProductsSiAbsente` : une base existante créée avant
 * cette évolution n'a jamais vu ces tables).
 */
function creerTablesCategoriesSiAbsentes(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id            TEXT PRIMARY KEY,
      nom           TEXT NOT NULL,
      image_data_url TEXT,
      ordre         INTEGER NOT NULL DEFAULT 0,
      deleted_at    TEXT,
      deleted_by    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sous_categories (
      id            TEXT PRIMARY KEY,
      categorie_id  TEXT NOT NULL REFERENCES categories (id),
      nom           TEXT NOT NULL,
      ordre         INTEGER NOT NULL DEFAULT 0,
      deleted_at    TEXT,
      deleted_by    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sous_categories_categorie ON sous_categories (categorie_id);");
}

/**
 * Même évolution — colonne ajoutée sur une base créée avant cette
 * extension. Pose uniquement la colonne au niveau schéma : le type
 * partagé `ModeleProduit` et `ModeleRepository` ne l'exposent pas
 * encore (phase Catalogue, ultérieure) — le rattachement par défaut
 * ci-dessous (`migrerCarrelageVersCategorieParDefautSiAbsent`) opère
 * directement en SQL, sans dépendre du repository.
 */
function ajouterSousCategorieIdModelesSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(modeles_produit)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "sous_categorie_id")) {
    db.exec("ALTER TABLE modeles_produit ADD COLUMN sous_categorie_id TEXT REFERENCES sous_categories (id)");
  }
}

/**
 * Décision explicite du client (fondations quincaillerie, Phase 1) :
 * tout modèle existant doit être rattaché automatiquement à la
 * catégorie "Carrelage et revêtements" à la migration — rien ne doit
 * disparaître de la grille catalogue le premier jour.
 *
 * Durcissement (diagnostic "130 carreaux, 1 seul affiché", 2026-11-18) :
 * cette migration était gardée par `COUNT(*) FROM categories === 0`,
 * supposant qu'une table `categories` non vide signifiait "déjà migrée
 * ici". Or la synchronisation du référentiel commun (catégories/
 * sous-catégories reçues d'un AUTRE poste ou du serveur) peut remplir
 * cette table AVANT que cette migration n'ait eu l'occasion de tourner
 * sur CE poste pour une raison SANS AUCUN rapport avec "Carrelage et
 * revêtements"/"Carreaux" — la condition se déclenchait alors à tort, et
 * la migration restait sautée en permanence (elle ne retente jamais).
 * Tout modèle legacy resterait alors avec `sous_categorie_id IS NULL`,
 * récupéré ensuite par le filet de sécurité générique
 * `migrerModelesNonClassesVersDiversSiAbsent` ci-dessous, qui l'enterre
 * sous "Divers > Non classé" — un emplacement que personne ne consulte
 * en cherchant des carreaux. Ce mécanisme reste une cause possible, mais
 * NON confirmée sur la base réelle concernée (voir le rapport d'incident
 * du 2026-11-18 — l'explication retenue pour ce cas précis est la
 * scission des catalogues entre les deux sous-catégories "Carreaux"
 * dupliquées de l'incident du 2026-11-17, déjà traitée par
 * `reaffecterModelesDepuisSousCategoriesCopieVersOriginalesSiPresentes`).
 * Ce durcissement reste appliqué par prudence, sans données à déplacer
 * automatiquement ici (voir cette fonction — aucun rattrapage rétroactif
 * n'accompagne ce changement, pour ne jamais risquer de reclasser à tort
 * un modèle déjà égaré sous "Divers > Non classé" pour une AUTRE raison).
 *
 * Corrigée : la condition "première fois sur ce poste" se vérifie
 * désormais PAR NOM, spécifiquement sur "Carrelage et revêtements" >
 * "Carreaux" (même principe que `initialiserCategoriesQuincailleriePredefiniesSiAbsentes`
 * — jamais de doublon par nom) — jamais sur le contenu de toute la table
 * `categories`, qu'une tout autre sous-catégorie reçue par ailleurs ne
 * doit jamais pouvoir fausser. Le balayage ponctuel des modèles
 * `sous_categorie_id IS NULL` ne s'effectue QUE lorsque "Carreaux" vient
 * d'être créée ici (comportement "une seule fois" inchangé) : un modèle
 * créé plus tard, sans classement, reste la responsabilité du filet de
 * sécurité générique `migrerModelesNonClassesVersDiversSiAbsent`
 * ci-dessous (jamais réaffecté ici après ce premier passage).
 */
function migrerCarrelageVersCategorieParDefautSiAbsent(db: Database.Database): string[] {
  const now = new Date().toISOString();
  const migrer = db.transaction((): string[] => {
    let categorie = db.prepare("SELECT id FROM categories WHERE nom = ? AND deleted_at IS NULL").get("Carrelage et revêtements") as
      | { id: string }
      | undefined;
    if (!categorie) {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, NULL, 0, NULL, NULL, ?, ?)"
      ).run(id, "Carrelage et revêtements", now, now);
      categorie = { id };
    }

    const sousCategorieExistante = db
      .prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = ? AND deleted_at IS NULL")
      .get(categorie.id, "Carreaux") as { id: string } | undefined;
    if (sousCategorieExistante) return []; // déjà passée ici (ou reçue identique via sync) — jamais de second balayage.

    const sousCategorieId = randomUUID();
    db.prepare(
      "INSERT INTO sous_categories (id, categorie_id, nom, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, NULL, ?, ?)"
    ).run(sousCategorieId, categorie.id, "Carreaux", now, now);

    // Capturés AVANT la mise à jour (plus NULL ensuite) — renvoyés pour
    // que l'appelant mette ce reclassement en file vers le serveur
    // central (voir le commentaire de `runMigrations` ci-dessus : ce
    // balayage en SQL brut ne passe jamais par `enqueueModeleSync` ici).
    const idsReclasses = (db.prepare("SELECT id FROM modeles_produit WHERE sous_categorie_id IS NULL").all() as { id: string }[]).map((r) => r.id);
    db.prepare("UPDATE modeles_produit SET sous_categorie_id = ?, updated_at = ? WHERE sous_categorie_id IS NULL").run(sousCategorieId, now);
    return idsReclasses;
  });
  return migrer();
}

/**
 * Fondations quincaillerie (Phase 1) — configuration pure (noms de
 * champs suggérés par sous-catégorie), jamais de donnée transactionnelle
 * — voir shared-types/caracteristiques.ts (fusionnerCaracteristiquesSuggerees).
 */
function creerTableSousCategorieChampsSiAbsente(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sous_categorie_champs (
      id                TEXT PRIMARY KEY,
      sous_categorie_id TEXT NOT NULL REFERENCES sous_categories (id),
      nom               TEXT NOT NULL,
      ordre             INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sous_categorie_champs_sous_categorie ON sous_categorie_champs (sous_categorie_id);");
}

/**
 * Fondations quincaillerie (Phase 3 bis) — voir shared-types/categorie.ts
 * (ModelePhysiqueSousCategorie, ConfigurationUnitesSousCategorie).
 * `modele_physique` : NULL par défaut (comportement inchangé pour toute
 * sous-catégorie existante) — posé explicitement à "carreau" uniquement
 * par `marquerCarreauxCommeModelePhysiqueSiAbsent` ci-dessous, jamais
 * déduit ici. `unites_configurees` : `0` par défaut, donc AUCUNE
 * sous-catégorie existante ne devient restreinte par cette migration —
 * les 6 unités restent proposées tant qu'un administrateur ne configure
 * pas explicitement une restriction (voir SousCategorieUniteRepository).
 */
function ajouterModelePhysiqueEtUnitesConfigureesSousCategoriesSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(sous_categories)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "modele_physique")) {
    db.exec("ALTER TABLE sous_categories ADD COLUMN modele_physique TEXT");
  }
  if (!columns.some((c) => c.name === "unites_configurees")) {
    db.exec("ALTER TABLE sous_categories ADD COLUMN unites_configurees INTEGER NOT NULL DEFAULT 0");
  }
}

/**
 * Pose `modele_physique = 'carreau'` UNIQUEMENT sur la sous-catégorie
 * "Carreaux" déjà créée par `migrerCarrelageVersCategorieParDefautSiAbsent`
 * — un set de donnée ciblé, jamais une déduction par nom à l'exécution
 * de l'application (voir shared-types/categorie.ts). Exécutée à chaque
 * migration (même filet de sécurité que `migrerModelesNonClassesVersDiversSiAbsent`),
 * mais la clause `modele_physique IS NULL` la rend inoffensive au-delà
 * de la première fois : elle ne touche plus jamais une ligne déjà posée
 * (y compris si un administrateur la modifiait manuellement plus tard).
 */
function marquerCarreauxCommeModelePhysiqueSiAbsent(db: Database.Database): void {
  db.prepare("UPDATE sous_categories SET modele_physique = 'carreau' WHERE nom = 'Carreaux' AND modele_physique IS NULL").run();
}

/**
 * Fondations quincaillerie (Phase 3 bis) — voir shared-types/categorie.ts
 * (ConfigurationUnitesSousCategorie). Une sous-catégorie absente de
 * cette table n'est pas restreinte, voir domain/catalogue.
 */
function creerTableSousCategorieUnitesSiAbsente(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sous_categorie_unites (
      sous_categorie_id TEXT NOT NULL REFERENCES sous_categories (id),
      unite_vente       TEXT NOT NULL,
      PRIMARY KEY (sous_categorie_id, unite_vente)
    );
  `);
}

/**
 * Fondations quincaillerie (Phase 3 bis) — voir shared-types/categorie.ts
 * (TypeChampCaracteristique, RoleChampCaracteristique). Toute ligne
 * déjà existante (simple nom suggéré) prend les valeurs par défaut
 * (`type:'texte'`, `obligatoire:0`, le reste NULL) — aucune perte,
 * aucun comportement changé pour les champs déjà configurés.
 */
function ajouterProprietesChampsSousCategorieSiAbsentes(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(sous_categorie_champs)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "type")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN type TEXT NOT NULL DEFAULT 'texte'");
  }
  if (!columns.some((c) => c.name === "obligatoire")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN obligatoire INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((c) => c.name === "valeurs_autorisees")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN valeurs_autorisees TEXT");
  }
  if (!columns.some((c) => c.name === "unite_mesure")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN unite_mesure TEXT");
  }
  if (!columns.some((c) => c.name === "role")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN role TEXT");
  }
}

/**
 * Phase 5 (référentiel commun), sous-phase 5.4 — voir le commentaire
 * d'appel dans `runMigrations` ci-dessus pour le raisonnement complet.
 * Idempotente comme toutes les migrations de ce fichier : vérifie
 * l'absence de la colonne avant de l'ajouter, jamais un doublon de
 * migration si elle existe déjà.
 */
function ajouterColonnesDeletedSousCategorieChampsSiAbsentes(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(sous_categorie_champs)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "deleted_at")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN deleted_at TEXT");
  }
  if (!columns.some((c) => c.name === "deleted_by")) {
    db.exec("ALTER TABLE sous_categorie_champs ADD COLUMN deleted_by TEXT");
  }
}

/**
 * ACTIVÉE (voir l'appel dans `runMigrations` ci-dessus). Exportée
 * également pour un test dédié.
 *
 * Nettoyage de l'incident réel du 2026-11-17 (deux postes, PC Shop et
 * Renams, ayant démarré la 0.12.0 à quelques minutes d'intervalle ont
 * chacun créé localement leur propre jeu des 20 catégories prédéfinies
 * — voir le correctif de `CatalogueAccueilScreen.tsx` pour le diagnostic
 * complet). Les 20 doublons ont été renommés "<nom> (copie)" directement
 * sur le référentiel serveur (correctif d'urgence, sans redéploiement)
 * pour lever leur masquage à l'affichage ; ils restent néanmoins des
 * catégories/sous-catégories bien réelles, potentiellement porteuses de
 * modèles sur l'un ou l'autre poste.
 *
 * Cette migration réaffecte, UNIQUEMENT EN LOCAL, tout modèle encore
 * attaché à une sous-catégorie "(copie)" vers son équivalent de même nom
 * sous la catégorie non suffixée — jamais l'inverse (le nom SANS
 * "(copie)" est toujours la cible). AUCUNE suppression, AUCUN tombstone
 * émis ici : une suppression émise par CE poste pendant que l'AUTRE
 * poste n'a pas encore exécuté cette même réaffectation s'appliquerait
 * chez lui sans la garde bloquante locale habituelle (suppression REÇUE
 * via `creerDepuisServeur`, jamais soumise à cette garde — voir
 * `catalogue:supprimerSousCategorie` dans `ipc/metier.ts`), ce qui
 * reproduirait exactement l'incident corrigé ici. Les catégories/sous-
 * catégories "(copie)", une fois vidées de tout modèle sur les DEUX
 * postes, resteront donc intactes mais vides — à supprimer plus tard
 * MANUELLEMENT depuis "Gérer les catégories" une fois cette version
 * installée partout (leur compteur de produits affichera alors 0 de
 * façon fiable, confirmant qu'il n'y a plus rien à perdre).
 *
 * Idempotente comme `migrerModelesNonClassesVersDiversSiAbsent` :
 * exécutée à chaque démarrage, sans effet dès qu'aucun modèle local ne
 * référence plus une sous-catégorie "(copie)".
 */
export function reaffecterModelesDepuisSousCategoriesCopieVersOriginalesSiPresentes(db: Database.Database): void {
  const paires = db
    .prepare(
      `SELECT scCopie.id AS idCopie, scCible.id AS idCible
       FROM sous_categories scCopie
       JOIN categories catCopie ON catCopie.id = scCopie.categorie_id
       JOIN categories catCible ON catCible.nom = substr(catCopie.nom, 1, length(catCopie.nom) - length(' (copie)'))
       JOIN sous_categories scCible ON scCible.categorie_id = catCible.id AND scCible.nom = scCopie.nom
       WHERE catCopie.nom LIKE '% (copie)'
         AND scCopie.deleted_at IS NULL AND catCopie.deleted_at IS NULL
         AND scCible.deleted_at IS NULL AND catCible.deleted_at IS NULL
         AND scCible.id != scCopie.id`
    )
    .all() as { idCopie: string; idCible: string }[];

  if (paires.length === 0) return;

  const reaffecter = db.transaction(() => {
    for (const { idCopie, idCible } of paires) {
      db.prepare("UPDATE modeles_produit SET sous_categorie_id = ? WHERE sous_categorie_id = ? AND deleted_at IS NULL").run(idCible, idCopie);
    }
  });
  reaffecter();
}

/**
 * Filet de sécurité (fondations quincaillerie, Phase 1) : une fois la
 * sous-catégorie rendue obligatoire à la création d'un modèle (phase
 * Catalogue, ultérieure), ce cas ne devrait plus jamais se produire par
 * le flux normal de l'application. Reste néanmoins exécutée à CHAQUE
 * migration (contrairement à `migrerCarrelageVersCategorieParDefautSiAbsent`,
 * qui ne s'exécute qu'une seule fois) : filet de sécurité réel pour toute
 * donnée qui échapperait à cette règle (import, correction manuelle,
 * ancien chemin de code non prévu) — décision explicite du client :
 * "les produits non classés iront directement dans divers", jamais
 * silencieusement invisibles du catalogue.
 */
function migrerModelesNonClassesVersDiversSiAbsent(db: Database.Database): string[] {
  const nonClasses = db.prepare("SELECT COUNT(*) as n FROM modeles_produit WHERE sous_categorie_id IS NULL AND deleted_at IS NULL").get() as { n: number };
  if (nonClasses.n === 0) return [];

  const now = new Date().toISOString();
  const migrer = db.transaction((): string[] => {
    let categorieDivers = db.prepare("SELECT id FROM categories WHERE nom = ? AND deleted_at IS NULL").get("Divers") as { id: string } | undefined;
    if (!categorieDivers) {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, 'Divers', NULL, 999, NULL, NULL, ?, ?)"
      ).run(id, now, now);
      categorieDivers = { id };
    }

    let sousCategorieNonClasse = db
      .prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = ? AND deleted_at IS NULL")
      .get(categorieDivers.id, "Non classé") as { id: string } | undefined;
    if (!sousCategorieNonClasse) {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO sous_categories (id, categorie_id, nom, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, 'Non classé', 999, NULL, NULL, ?, ?)"
      ).run(id, categorieDivers.id, now, now);
      sousCategorieNonClasse = { id };
    }

    // Même raison que `migrerCarrelageVersCategorieParDefautSiAbsent`
    // ci-dessus : capturés avant la mise à jour, renvoyés pour mise en
    // file de synchro par l'appelant.
    const idsReclasses = (db.prepare("SELECT id FROM modeles_produit WHERE sous_categorie_id IS NULL").all() as { id: string }[]).map((r) => r.id);
    db.prepare("UPDATE modeles_produit SET sous_categorie_id = ?, updated_at = ? WHERE sous_categorie_id IS NULL").run(sousCategorieNonClasse.id, now);
    return idsReclasses;
  });
  return migrer();
}

/** Fondations quincaillerie (Phase 2) — colonne ajoutée sur une base créée avant cette extension. */
function ajouterMarqueModelesSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(modeles_produit)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "marque")) {
    db.exec("ALTER TABLE modeles_produit ADD COLUMN marque TEXT");
  }
}

/** Même évolution — dénormalisé sur produits, même principe que motif/type. */
function ajouterMarqueProduitsSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "marque")) {
    db.exec("ALTER TABLE produits ADD COLUMN marque TEXT");
  }
}

/**
 * Les 20 catégories "visuelles" de la version 0.11.1 (voir
 * `packages/electron-app/src/renderer/app/screens/catalogueImages.ts`,
 * mêmes noms, même ordre) et leurs sous-catégories — reprises TELLES
 * QUELLES du prototype (`D:\Devellopement\Test\maxi-equip\packages\
 * electron-app\src\main\maintenance\seedCategoriesCatalogue.ts`), jamais
 * inventées ici. Les images ne sont PAS stockées en base : le Renderer
 * les associe déjà par nom (`illustrationCategorie`), donc aucune donnée
 * dupliquée. "Carreaux" (sous "Carrelage et revêtements") et "Non classé"
 * (sous "Divers") existent déjà par ailleurs (voir
 * `migrerCarrelageVersCategorieParDefautSiAbsent` /
 * `migrerModelesNonClassesVersDiversSiAbsent`) et ne sont donc jamais
 * repris dans les listes ci-dessous.
 */
const CATEGORIES_QUINCAILLERIE_PREDEFINIES: { nom: string; sousCats: string[] }[] = [
  { nom: "Carrelage et revêtements", sousCats: ["Revêtements muraux", "Colles et joints carrelage", "Plinthes et profilés"] },
  { nom: "Matériaux de construction", sousCats: ["Ciment", "Sable et graviers", "Parpaings et briques", "Chaux et enduits", "Fers à béton"] },
  { nom: "Sanitaires et toilettes", sousCats: ["Toilettes", "Lavabos", "Éviers", "Douches", "Accessoires"] },
  { nom: "Plomberie et évacuation", sousCats: ["Tuyaux", "Raccords", "Colles et accessoires", "Siphons et évacuations", "Robinetterie", "Réservoirs et citernes", "Pompes", "Joints et étanchéité"] },
  { nom: "Électricité", sousCats: ["Câbles et fils", "Prises et interrupteurs", "Disjoncteurs et tableaux", "Goulottes et gaines", "Domotique"] },
  { nom: "Éclairage", sousCats: ["Ampoules et tubes", "Luminaires intérieurs", "Projecteurs extérieurs", "Rubans LED"] },
  { nom: "Peinture et décoration", sousCats: ["Peintures", "Enduits et sous-couches", "Outils d'application", "Nuanciers et accessoires"] },
  { nom: "Bois et menuiserie", sousCats: ["Bois de charpente", "Panneaux et contreplaqués", "Quincaillerie bois", "Moulures et baguettes"] },
  { nom: "Couverture et toiture", sousCats: ["Tuiles", "Tôles et bacs acier", "Gouttières et descentes", "Accessoires de toiture"] },
  { nom: "Visserie et fixation", sousCats: ["Vis", "Boulons et écrous", "Chevilles", "Rivets", "Colliers de serrage"] },
  { nom: "Outillage manuel", sousCats: ["Outils de frappe", "Outils de serrage", "Outils de coupe", "Mesure et traçage"] },
  { nom: "Outillage électrique", sousCats: ["Perceuses et visseuses", "Meuleuses", "Scies électriques", "Accessoires et batteries"] },
  { nom: "Accessoires de pose", sousCats: ["Croisillons et cales", "Niveaux et équerres", "Spatules et taloches", "Mélangeurs et auges"] },
  { nom: "Étanchéité et isolation", sousCats: ["Isolants thermiques", "Membranes d'étanchéité", "Mastics et silicones", "Mousses expansives"] },
  { nom: "Équipements de protection", sousCats: ["Casques", "Gants", "Chaussures de sécurité", "Lunettes et protections auditives"] },
  { nom: "Jardinage et espaces extérieurs", sousCats: ["Arrosage", "Outillage de jardin", "Mobilier extérieur", "Brouettes et transport"] },
  { nom: "Portes et fenêtres", sousCats: ["Portes intérieures", "Portes extérieures", "Fenêtres", "Quincaillerie et poignées"] },
  { nom: "Chimie du bâtiment", sousCats: ["Mortiers et colles", "Résines et silicones", "Produits de nettoyage", "Adjuvants béton"] },
  { nom: "Climatisation et ventilation", sousCats: ["Climatiseurs", "Ventilateurs", "Unités extérieures", "Accessoires d'installation"] },
  { nom: "Divers", sousCats: ["Outillage divers", "Bidons et contenants", "Échelles et escabeaux", "Accessoires divers"] },
];

/**
 * Champs suggérés d'exemple — repris TELS QUELS du prototype
 * (`seedChampsExemplesCatalogue.ts`). Volontairement limité à ces 5
 * sous-catégories (jamais étendu par supposition) : le client reste
 * libre d'ajouter les autres depuis "Gérer les catégories".
 */
const CHAMPS_SUGGERES_QUINCAILLERIE_PREDEFINIS: { categorie: string; sousCategorie: string; champs: string[] }[] = [
  { categorie: "Carrelage et revêtements", sousCategorie: "Carreaux", champs: ["Matière", "Finition", "Couleur"] },
  { categorie: "Carrelage et revêtements", sousCategorie: "Colles et joints carrelage", champs: ["Type de produit", "Couleur", "Poids du conditionnement", "Usage"] },
  { categorie: "Plomberie et évacuation", sousCategorie: "Tuyaux", champs: ["Matière", "Diamètre", "Longueur", "Pression nominale"] },
  { categorie: "Électricité", sousCategorie: "Câbles et fils", champs: ["Type", "Section", "Nombre de conducteurs"] },
  { categorie: "Peinture et décoration", sousCategorie: "Peintures", champs: ["Couleur", "Finition", "Volume", "Rendement"] },
];

/**
 * Initialise le catalogue quincaillerie : crée les 20 catégories
 * ci-dessus si elles n'existent pas déjà (par nom, jamais par doublon),
 * leurs sous-catégories prédéfinies, puis les champs suggérés
 * correspondants. Exécutée à CHAQUE migration (comme
 * `migrerModelesNonClassesVersDiversSiAbsent`) — jamais gardée par un
 * "une seule fois" global, pour rattraper aussi une base déjà existante
 * qui n'a encore aucune de ces catégories. Idempotente à trois niveaux
 * (catégorie / sous-catégorie / champ) : une entité déjà présente (même
 * créée manuellement par l'utilisateur sous le même nom) n'est jamais
 * recréée, jamais renommée, jamais réordonnée — seule l'absence déclenche
 * une création.
 */
function initialiserCategoriesQuincailleriePredefiniesSiAbsentes(db: Database.Database): void {
  const now = new Date().toISOString();

  const initialiser = db.transaction(() => {
    for (const [index, def] of CATEGORIES_QUINCAILLERIE_PREDEFINIES.entries()) {
      const categorieExistante = db.prepare("SELECT id FROM categories WHERE nom = ? AND deleted_at IS NULL").get(def.nom) as
        | { id: string }
        | undefined;
      let categorieId: string;
      if (categorieExistante) {
        categorieId = categorieExistante.id;
      } else {
        categorieId = randomUUID();
        db.prepare(
          "INSERT INTO categories (id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?)"
        ).run(categorieId, def.nom, index, now, now);
      }

      for (const [sousIndex, nomSousCat] of def.sousCats.entries()) {
        const sousCategorieExistante = db
          .prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = ? AND deleted_at IS NULL")
          .get(categorieId, nomSousCat);
        if (sousCategorieExistante) continue;
        db.prepare(
          "INSERT INTO sous_categories (id, categorie_id, nom, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)"
        ).run(randomUUID(), categorieId, nomSousCat, sousIndex, now, now);
      }
    }

    for (const def of CHAMPS_SUGGERES_QUINCAILLERIE_PREDEFINIS) {
      const categorie = db.prepare("SELECT id FROM categories WHERE nom = ? AND deleted_at IS NULL").get(def.categorie) as
        | { id: string }
        | undefined;
      if (!categorie) continue;
      const sousCategorie = db
        .prepare("SELECT id FROM sous_categories WHERE categorie_id = ? AND nom = ? AND deleted_at IS NULL")
        .get(categorie.id, def.sousCategorie) as { id: string } | undefined;
      if (!sousCategorie) continue;

      for (const [ordre, nomChamp] of def.champs.entries()) {
        const champExistant = db
          .prepare("SELECT id FROM sous_categorie_champs WHERE sous_categorie_id = ? AND nom = ?")
          .get(sousCategorie.id, nomChamp);
        if (champExistant) continue;
        db.prepare(
          "INSERT INTO sous_categorie_champs (id, sous_categorie_id, nom, ordre, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(randomUUID(), sousCategorie.id, nomChamp, ordre, now, now);
      }
    }
  });

  initialiser();
}

/**
 * Correction "Workflow réel des demandes" — historique de suivi
 * (Partie 5/6/7) : chaque changement de statut peut porter un
 * commentaire libre, conservé pour comprendre plus tard ce qui a déjà
 * été fait. Table strictement additive, jamais un remplacement de
 * `demandes.statut` (qui reste la source de vérité pour le statut
 * ACTUEL) — uniquement un journal.
 */
function creerTableSuiviDemandeSiAbsente(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suivi_demande (
      id TEXT PRIMARY KEY,
      demande_id TEXT NOT NULL REFERENCES demandes (id),
      statut TEXT NOT NULL,
      commentaire TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Correction "Workflow réel des demandes", Partie 3 : le statut
 * "contactee" est retiré du workflow actif (le fait d'avoir contacté le
 * client devient un COMMENTAIRE de suivi sur le statut "en_cours",
 * jamais un statut technique séparé). Les demandes déjà au statut
 * "contactee" (créées avant cette correction) sont migrées vers
 * "en_cours" — jamais laissées dans un état devenu invisible de
 * l'interface. Idempotent : sans effet si aucune ligne n'est concernée.
 */
function migrerAncienStatutContacteeSiPresent(db: Database.Database): void {
  db.exec("UPDATE demandes SET statut = 'en_cours', updated_at = updated_at WHERE statut = 'contactee'");
}

/**
 * Phase 4.1, Partie 17 — une demande reçue via PULL (Partie 4) doit
 * pouvoir être identifiée de façon idempotente : le même identifiant
 * source (attribué par le serveur/site) ne doit jamais créer deux
 * demandes locales, même si un même lot d'opérations était pull à
 * nouveau. NULL pour toute demande créée directement dans l'application
 * (aucun identifiant source) — un index UNIQUE sur SQLite autorise
 * plusieurs NULL sans conflit, donc cette colonne ne contraint jamais
 * les demandes locales.
 */
function ajouterSourceEntityIdDemandesSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(demandes)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "source_entity_id")) {
    db.exec("ALTER TABLE demandes ADD COLUMN source_entity_id TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_demandes_source_entity_id ON demandes (source_entity_id) WHERE source_entity_id IS NOT NULL");
  }
}

/**
 * Correction "Phase 3.8 — Sauvegarde", Partie 1 point 10 : aucune
 * version de schéma n'existait avant cette étape (chaque migration
 * vérifiait individuellement sa propre condition, `PRAGMA table_info`,
 * jamais un numéro global). `PRAGMA user_version` est le mécanisme
 * natif SQLite prévu exactement pour cet usage — gratuit, déjà présent
 * dans le moteur, aucune nouvelle dépendance ni nouvelle table.
 *
 * Cette constante DOIT être incrémentée manuellement à chaque nouvelle
 * migration ajoutée dans cette fonction — c'est désormais la seule
 * source de vérité pour "quelle version de schéma cette base
 * possède-t-elle", utilisée par `BackupService` (metadata.json) et,
 * plus tard, par la restauration (Phase 3.9) pour valider la
 * compatibilité d'une sauvegarde avant de l'appliquer.
 */
export const SCHEMA_VERSION = 10;

function setSchemaVersion(db: Database.Database): void {
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

/** Lecture seule — utilisée par BackupService, jamais par une migration (qui doit utiliser setSchemaVersion via runMigrations). */
export function getSchemaVersion(db: Database.Database): number {
  const row = db.pragma("user_version", { simple: true }) as number;
  return row;
}

/**
 * Correction "SHOP sur la facture" : garantit qu'une ligne de
 * configuration existe toujours dans la table `parametres_entreprise`
 * (table déjà définie dans schema.sql — pas de nouvelle table créée) —
 * sans écraser une valeur déjà personnalisée par l'Administrateur
 * (INSERT OR IGNORE, jamais UPDATE). Les valeurs par défaut reprennent
 * les informations légales déjà utilisées sur le modèle de facture
 * officiel (packages/electron-app/src/main/services/factureDocumentService.ts),
 * jamais inventées.
 */
function seedParametresEntrepriseSiAbsent(db: Database.Database): void {
  db.prepare(
    `INSERT OR IGNORE INTO parametres_entreprise (id, nom, logo_url, adresse, ville, telephone, email, whatsapp, updated_at)
     VALUES ('singleton', 'MAXI-EQUIP', NULL, 'Quartier Beaulieu (face à BATI-PLUS), Akanda', 'Libreville', '066 33 87 30', '', '', ?)`
  ).run(new Date().toISOString());
}

/**
 * Correction "Paramètres" §Identité : plusieurs numéros de téléphone
 * doivent être possibles. Si `telephones_entreprise` est encore vide,
 * reprend l'ancien numéro unique (`parametres_entreprise.telephone`,
 * jamais supprimé) comme première entrée — aucune donnée perdue. Ne
 * s'exécute qu'une seule fois (table déjà non vide ensuite).
 */
function migrerTelephoneUniqueVersTable(db: Database.Database): void {
  const dejaMigre = (db.prepare("SELECT COUNT(*) as n FROM telephones_entreprise").get() as { n: number }).n > 0;
  if (dejaMigre) return;

  const ancien = db.prepare("SELECT telephone FROM parametres_entreprise WHERE id = 'singleton'").get() as { telephone: string } | undefined;
  if (ancien?.telephone) {
    db.prepare("INSERT INTO telephones_entreprise (id, numero, ordre, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run(
      randomUUID(),
      ancien.telephone,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }
}

/**
 * Correction "logique des dashboards Administrateur/Gérant" : ajoute la
 * colonne `utilisateur_id` à la table `mouvements` sur une base créée
 * avant cette évolution. Structure durable, pas une solution temporaire
 * (demande explicite) : chaque futur mouvement enregistre son auteur ;
 * les mouvements déjà existants restent avec `utilisateur_id = NULL`
 * (honnête — leur auteur réel n'a jamais été enregistré, impossible de
 * le reconstituer rétroactivement sans inventer une donnée).
 */
function addUtilisateurIdToMouvementsIfMissing(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(mouvements)").all() as { name: string }[];
  const hasColumn = columns.some((c) => c.name === "utilisateur_id");
  if (!hasColumn) {
    db.exec("ALTER TABLE mouvements ADD COLUMN utilisateur_id TEXT REFERENCES utilisateurs(id)");
  }
  // Toujours (re)créée après coup, jamais dans schema.sql lui-même : sur
  // une base déjà existante, "CREATE TABLE IF NOT EXISTS" ne recrée pas
  // la table (donc pas la colonne), mais une ligne "CREATE INDEX ... ON
  // mouvements (utilisateur_id)" placée directement dans schema.sql
  // s'exécuterait quand même et échouerait avec "no such column:
  // utilisateur_id" puisque la colonne n'existe pas encore à ce moment-là
  // — bug réel reproduit et corrigé ici. Une fois la colonne garantie
  // présente (ci-dessus, ou déjà là sur une base neuve), cette ligne est
  // sans risque dans les deux cas.
  db.exec("CREATE INDEX IF NOT EXISTS idx_mouvements_utilisateur ON mouvements (utilisateur_id)");
}

/**
 * Correction Phase 2 (gestion des images produits) : ajoute la colonne
 * `est_principale` à une base créée avant cette évolution — sans jamais
 * recréer la table ni perdre les images déjà associées à des produits.
 */
function addEstPrincipaleColumnIfMissing(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(images_produit)").all() as { name: string }[];
  const hasColumn = columns.some((c) => c.name === "est_principale");
  if (!hasColumn) {
    db.exec("ALTER TABLE images_produit ADD COLUMN est_principale INTEGER NOT NULL DEFAULT 0");
  }
}

/**
 * Corrige un bug réel signalé lors des tests (3ᵉ correction Phase 2 §5) :
 * la table `produits`, sur les bases créées avant cette correction,
 * portait une contrainte UNIQUE au niveau de la colonne `reference`,
 * appliquée à TOUTES les lignes — y compris celles supprimées (soft
 * delete). Résultat : la référence d'un produit supprimé restait bloquée
 * indéfiniment, empêchant sa réutilisation par un nouveau produit.
 *
 * SQLite ne permet pas de retirer une contrainte de colonne par un simple
 * ALTER TABLE — la table doit être recréée. Ceci est fait ici de façon
 * sûre (toutes les données existantes sont copiées, aucune perte),
 * uniquement si l'ancienne contrainte est détectée, jamais sinon
 * (idempotent).
 */
function fixReferenceUniqueConstraint(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'produits'").get() as
    | { sql: string }
    | undefined;
  if (!row || !/reference\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql)) {
    return; // Déjà corrigé (nouvelle base) ou table absente — rien à faire.
  }

  // IMPORTANT : PRAGMA foreign_keys est un no-op s'il est exécuté à
  // l'intérieur d'une transaction (documentation SQLite) — il doit donc
  // être basculé ICI, avant et après la transaction, jamais à l'intérieur
  // (c'était l'erreur : la désactivation n'avait aucun effet, et la
  // suppression de la table produits, référencée par clé étrangère
  // depuis stocks/mouvements/lignes_facture/images_produit, échouait avec
  // "FOREIGN KEY constraint failed").
  db.pragma("foreign_keys = OFF");
  try {
    const migrer = db.transaction(() => {
      db.exec(`
        CREATE TABLE produits_nouveau (
          id            TEXT PRIMARY KEY,
          modele_id     TEXT REFERENCES modeles_produit (id),
          motif         TEXT NOT NULL,
          type          TEXT NOT NULL,
          taille        TEXT NOT NULL,
          taille_tri    REAL NOT NULL,
          largeur       REAL,
          hauteur       REAL,
          reference     TEXT NOT NULL,
          prix          INTEGER NOT NULL,
          seuil_alerte  INTEGER NOT NULL DEFAULT 0,
          deleted_at    TEXT,
          deleted_by    TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );
      `);
      // Copie dynamique (jamais une liste figée — voir colonnesEnCommun) :
      // conserve modele_id/largeur/hauteur si déjà présentes, ne perd
      // jamais une colonne ajoutée par une migration plus récente.
      const colonnes = colonnesEnCommun(db, "produits", [
        "id", "modele_id", "motif", "type", "taille", "taille_tri", "largeur", "hauteur",
        "reference", "prix", "seuil_alerte", "deleted_at", "deleted_by", "created_at", "updated_at",
      ]);
      const liste = colonnes.join(", ");
      db.exec(`INSERT INTO produits_nouveau (${liste}) SELECT ${liste} FROM produits;`);
      db.exec("DROP TABLE produits;");
      db.exec("ALTER TABLE produits_nouveau RENAME TO produits;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_produits_taille_tri ON produits (taille_tri);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_produits_updated_at ON produits (updated_at);");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_produits_reference_actif ON produits (reference) WHERE deleted_at IS NULL;");
      // idx_produits_modele_id n'est PAS créé ici — ajouterIndexModeleIdProduitsSiAbsent()
      // (plus bas, après garantie de la colonne) s'en charge, cohérent avec le reste du fichier.
    });
    migrer();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * Ajoute les colonnes `largeur`/`hauteur` (3ᵉ correction Phase 2 §14/15) —
 * la taille reste également stockée sous forme de texte affichable
 * (`taille`) et de valeur de tri (`taille_tri`), inchangées, pour ne rien
 * casser de l'existant (tri, suggestions). Les deux nouvelles colonnes
 * sont nullables : les produits déjà créés avant cette évolution ne sont
 * pas rétroactivement modifiés, seuls les nouveaux/modifiés les renseignent.
 */
function addLargeurHauteurColumnsIfMissing(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "largeur")) {
    db.exec("ALTER TABLE produits ADD COLUMN largeur REAL");
  }
  if (!columns.some((c) => c.name === "hauteur")) {
    db.exec("ALTER TABLE produits ADD COLUMN hauteur REAL");
  }
}

/**
 * Correction "Points de vente dynamiques" : ajoute la colonne `actif`
 * sur une base créée avant cette évolution. Valeur par défaut 1 (actif)
 * pour tous les emplacements déjà existants (SHOP, Akébé, Akanda) —
 * aucun archivage rétroactif involontaire.
 */
function addActifColumnToEmplacementsIfMissing(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(emplacements)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "actif")) {
    db.exec("ALTER TABLE emplacements ADD COLUMN actif INTEGER NOT NULL DEFAULT 1");
  }
}

/**
 * Correction "Paramètres — Administrateur/Gérant configurables" : ajoute
 * les colonnes des noms de responsables sur une base créée avant cette
 * évolution. NULL par défaut (jamais une valeur inventée) — le rendu des
 * documents doit déjà gérer l'absence de valeur proprement (§8).
 */
function addResponsablesColumnsIfMissing(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(parametres_entreprise)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "nom_administrateur")) {
    db.exec("ALTER TABLE parametres_entreprise ADD COLUMN nom_administrateur TEXT");
  }
  if (!columns.some((c) => c.name === "nom_gerant")) {
    db.exec("ALTER TABLE parametres_entreprise ADD COLUMN nom_gerant TEXT");
  }
}

/**
 * Correction "Phase 3.7 — Moteur de synchronisation", Partie 10/11 :
 * deux tables PUREMENT TECHNIQUES, jamais appliquées aux données
 * métier (Partie 9 : "ne pas modifier stock/vente/facture depuis un
 * PULL").
 *
 * `sync_etat` — un singleton conservant le dernier curseur serveur
 * réellement traité (Partie 11). Mise à jour uniquement APRÈS
 * enregistrement réussi des opérations reçues, dans la même transaction
 * (Partie 18) — jamais un curseur avancé avant que les données
 * correspondantes ne soient conservées.
 *
 * `sync_recu` — journal technique des opérations reçues via PULL
 * (Partie 10) : conservées pour une évolution future, jamais
 * transformées en écriture sur les tables métier existantes. Une
 * contrainte UNIQUE sur `curseur_serveur` reste un filet de sécurité
 * supplémentaire (le curseur empêche déjà normalement une redemande de
 * la même plage), jamais le seul mécanisme d'idempotence.
 */
function createSyncTablesIfMissing(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_etat (
      id TEXT PRIMARY KEY CHECK (id = 'singleton'),
      dernier_curseur INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  const existeDeja = db.prepare("SELECT 1 FROM sync_etat WHERE id = 'singleton'").get();
  if (!existeDeja) {
    db.prepare("INSERT INTO sync_etat (id, dernier_curseur, updated_at) VALUES ('singleton', 0, ?)").run(new Date().toISOString());
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_recu (
      id TEXT PRIMARY KEY,
      curseur_serveur INTEGER NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      recu_le TEXT NOT NULL,
      -- Correction "visibilité croisée Factures/Historique entre
      -- postes" (2026-10-27), Phase 4 — voir
      -- ajouterColonneAppliqueSyncRecuSiAbsente ci-dessous pour le
      -- raisonnement complet.
      applique INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/**
 * Correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27), Phase 4 — ajoute la colonne `applique` sur une base
 * créée avant cette évolution (`CREATE TABLE IF NOT EXISTS` ci-dessus
 * ne touche jamais une table déjà existante).
 *
 * Le curseur `/v1/sync/pull` avance de façon strictement croissante :
 * une opération déjà renvoyée une fois ne l'est plus jamais (voir
 * pull.ts côté API). Jusqu'ici ce n'était pas un problème : seul le
 * type "demande" était réellement appliqué aux données métier, et sa
 * clé étrangère produit_id est délibérément NON contrainte (une
 * demande vient d'une source externe, voir
 * retirerContrainteProduitIdLignesDemandeSiPresente). Les nouveaux
 * types appliqués en Phase 4 (vente/annulation/entree/sortie/
 * transfert) référencent eux de VRAIES clés étrangères
 * (emplacement_id, vendeur_utilisateur_id, produit_id...) qui peuvent
 * ne pas encore être résolvables localement au moment du PULL (dépôt/
 * compte/produit pas encore rattrapé par un autre cycle, voir
 * EmplacementSyncService/CompteSyncService/CatalogueSyncService) — sans
 * ce suivi, une telle opération échouerait silencieusement UNE FOIS et
 * ne serait plus jamais retentée, le curseur ayant déjà avancé au-delà
 * d'elle. `applique = 0` par défaut, mis à 1 uniquement après une
 * application réussie — un balayage dédié (voir
 * SyncRepository.listerNonAppliquees) retente à chaque cycle de
 * synchronisation tout ce qui reste à 0, jusqu'à ce que ses dépendances
 * soient enfin connues localement.
 */
function ajouterColonneAppliqueSyncRecuSiAbsente(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(sync_recu)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "applique")) {
    db.exec("ALTER TABLE sync_recu ADD COLUMN applique INTEGER NOT NULL DEFAULT 0");
  }
}

/**
 * PROMOTIONS — migration de l'ancien schéma (produit_id + prix_promotionnel)
 * vers le nouveau (libelle + type_reduction + valeur + perimetre).
 *
 * Détection : l'ancienne table possède une colonne `produit_id` — la
 * nouvelle n'en a pas (les produits ciblés sont dans `promotion_produits`).
 * Idempotente : sans effet si la nouvelle table est déjà en place.
 * Les anciennes promotions sont perdues lors de cette migration — elles
 * portaient des données structurellement incompatibles (prix absolu au
 * lieu d'une réduction), aucune conversion sans pertes n'est possible ni
 * souhaitable. Une installation propre repart sans donnée promotionnelle
 * (comportement correct : les promotions sont recréées par l'Administrateur).
 */
function migrerTablePromotionsSiAncienSchema(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'promotions'").get() as { sql: string } | undefined;
  if (!row) return; // Table absente — schema.sql l'a déjà créée dans le bon format.
  if (!row.sql.includes("produit_id")) return; // Déjà migré.

  db.pragma("foreign_keys = OFF");
  try {
    const migrer = db.transaction(() => {
      db.exec("DROP TABLE IF EXISTS promotions;");
      db.exec(`
        CREATE TABLE IF NOT EXISTS promotions (
          id              TEXT PRIMARY KEY,
          libelle         TEXT NOT NULL,
          type_reduction  TEXT NOT NULL CHECK (type_reduction IN ('pourcentage', 'montant_fixe')),
          valeur          REAL NOT NULL CHECK (valeur > 0),
          perimetre       TEXT NOT NULL CHECK (perimetre IN ('global', 'cible')),
          date_debut      TEXT NOT NULL,
          date_fin        TEXT NOT NULL,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_promotions_date ON promotions (date_debut, date_fin);");
      db.exec(`
        CREATE TABLE IF NOT EXISTS promotion_produits (
          promotion_id  TEXT NOT NULL REFERENCES promotions (id) ON DELETE CASCADE,
          produit_id    TEXT NOT NULL REFERENCES produits (id),
          PRIMARY KEY (promotion_id, produit_id)
        );
      `);
    });
    migrer();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * PROMOTIONS — ajoute les colonnes de promotion sur `lignes_facture` pour
 * les bases créées avant cette évolution. Toutes nullables : les lignes
 * existantes sans promotion gardent leurs valeurs NULL (honnête — aucune
 * promotion n'était active au moment de ces ventes).
 */
function ajouterColonnesPromoLignesFactureSiAbsentes(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(lignes_facture)").all() as { name: string }[];
  const ajouter = (nom: string, definition: string) => {
    if (!columns.some((c) => c.name === nom)) {
      db.exec(`ALTER TABLE lignes_facture ADD COLUMN ${definition}`);
    }
  };
  ajouter("prix_unitaire_normal", "prix_unitaire_normal INTEGER");
  ajouter("promotion_id", "promotion_id TEXT");
  ajouter("promotion_libelle", "promotion_libelle TEXT");
  ajouter("promotion_type", "promotion_type TEXT");
  ajouter("promotion_valeur", "promotion_valeur REAL");
}

/**
 * Correction "Référence manquante sur la facture" — ajoute `reference`
 * sur `lignes_facture` pour les bases créées avant cette évolution.
 * Nullable : les lignes existantes gardent NULL (honnête — cette
 * référence n'a jamais été enregistrée pour ces ventes passées), affichée
 * comme "—" sur une facture réimprimée après coup, jamais une valeur
 * inventée. Même principe que motif/taille : un snapshot figé à la
 * vente, jamais une jointure live vers `produits`.
 */
function ajouterColonneReferenceLignesFactureSiAbsente(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(lignes_facture)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "reference")) {
    db.exec(`ALTER TABLE lignes_facture ADD COLUMN reference TEXT`);
  }
}

/**
 * Correction "Remise / Négociation" — ajoute `remise` sur `factures`
 * pour les bases créées avant cette évolution. `DEFAULT 0`, pas NULL :
 * une facture déjà existante n'a jamais eu de remise, 0 est la valeur
 * honnête, jamais une donnée manquante à distinguer.
 */
function ajouterColonneRemiseFacturesSiAbsente(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(factures)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "remise")) {
    db.exec(`ALTER TABLE factures ADD COLUMN remise INTEGER NOT NULL DEFAULT 0`);
  }
}

/**
 * Correction "Réservation / Acompte" : ajoute `statut_paiement` et
 * `montant_paye` sur une base créée avant cette évolution. Toute facture
 * déjà existante a nécessairement déjà été réglée intégralement (aucune
 * notion de réservation n'existait avant) — backfill explicite à "payee"
 * avec `montant_paye = total - remise` (jamais 0 par défaut pour ces
 * lignes historiques, qui casserait `validerMontantPaye` au premier
 * changement de statut).
 */
function ajouterColonnesStatutPaiementFacturesSiAbsentes(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(factures)").all() as { name: string }[];
  const statutAbsent = !columns.some((c) => c.name === "statut_paiement");
  const montantAbsent = !columns.some((c) => c.name === "montant_paye");
  if (statutAbsent) {
    db.exec(`ALTER TABLE factures ADD COLUMN statut_paiement TEXT NOT NULL DEFAULT 'payee' CHECK (statut_paiement IN ('reservation', 'payee'))`);
  }
  if (montantAbsent) {
    db.exec(`ALTER TABLE factures ADD COLUMN montant_paye INTEGER NOT NULL DEFAULT 0`);
  }
  if (statutAbsent || montantAbsent) {
    db.exec(`UPDATE factures SET montant_paye = total - remise WHERE montant_paye = 0`);
  }
}

/**
 * Correction "corriger une erreur de saisie de stock sans fausser le
 * tableau de bord" : ajoute les 3 colonnes d'annulation sur `mouvements`
 * (une base déjà existante n'avait que les colonnes historiques). Toutes
 * `NULL` par défaut — un mouvement déjà en base n'a jamais été annulé,
 * jamais une valeur devinée pour ces lignes historiques.
 */
function ajouterColonnesAnnulationMouvementsSiAbsentes(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(mouvements)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "annule_le")) {
    db.exec(`ALTER TABLE mouvements ADD COLUMN annule_le TEXT`);
  }
  if (!columns.some((c) => c.name === "annule_par")) {
    db.exec(`ALTER TABLE mouvements ADD COLUMN annule_par TEXT REFERENCES utilisateurs (id)`);
  }
  if (!columns.some((c) => c.name === "motif_annulation")) {
    db.exec(`ALTER TABLE mouvements ADD COLUMN motif_annulation TEXT`);
  }
}

/**
 * Correction "Facturation" (§5/§13/§14/§21) : ajoute les colonnes de
 * statut de livraison, d'annulation (suppression douce) et de mode de
 * règlement sur une base créée avant cette évolution, ET retire l'ancien
 * `numero TEXT NOT NULL UNIQUE` (bloquerait la réutilisation du même
 * numéro après une annulation+correction, §4 : "on conserve le même
 * numéro associé à l'opération").
 *
 * Même précaution que pour `utilisateur_id` : l'index partiel n'est créé
 * qu'APRÈS avoir garanti que les colonnes existent, jamais dans
 * schema.sql lui-même (bug déjà rencontré et corrigé une fois).
 */
function migrateFacturesPourAnnulationEtLivraison(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'factures'").get() as
    | { sql: string }
    | undefined;
  const ancienneContrainteUnique = row && /numero\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql);

  if (ancienneContrainteUnique) {
    db.pragma("foreign_keys = OFF");
    try {
      const migrer = db.transaction(() => {
        db.exec(`
          CREATE TABLE factures_nouveau (
            id                     TEXT PRIMARY KEY,
            numero                 TEXT NOT NULL,
            date                   TEXT NOT NULL,
            emplacement_id         TEXT NOT NULL REFERENCES emplacements (id),
            client_nom             TEXT NOT NULL,
            client_telephone       TEXT,
            client_adresse         TEXT,
            vendeur_utilisateur_id TEXT NOT NULL REFERENCES utilisateurs (id),
            vendeur_nom_manuel     TEXT,
            mode_reglement         TEXT,
            total                  INTEGER NOT NULL,
            statut_livraison       TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut_livraison IN ('en_attente', 'livree')),
            livree_le              TEXT,
            annulee_le             TEXT,
            annulee_par            TEXT REFERENCES utilisateurs (id),
            motif_annulation       TEXT,
            corrigee_par_facture_id TEXT REFERENCES factures (id),
            identite_snapshot_json TEXT,
            created_at             TEXT NOT NULL,
            updated_at             TEXT NOT NULL
          );
        `);
        // Copie dynamique (jamais une liste figée — voir colonnesEnCommun) :
        // sur une base encore plus ancienne que prévu, ou déjà partiellement
        // migrée de façon incohérente, toute colonne d'amélioration
        // (statut_livraison, identite_snapshot_json...) réellement déjà
        // présente est conservée au lieu d'être silencieusement réinitialisée.
        const colonnes = colonnesEnCommun(db, "factures", [
          "id", "numero", "date", "emplacement_id", "client_nom", "client_telephone", "client_adresse",
          "vendeur_utilisateur_id", "vendeur_nom_manuel", "mode_reglement", "total",
          "statut_livraison", "livree_le", "annulee_le", "annulee_par", "motif_annulation",
          "corrigee_par_facture_id", "identite_snapshot_json", "created_at", "updated_at",
        ]);
        const liste = colonnes.join(", ");
        db.exec(`INSERT INTO factures_nouveau (${liste}) SELECT ${liste} FROM factures;`);
        db.exec("DROP TABLE factures;");
        db.exec("ALTER TABLE factures_nouveau RENAME TO factures;");
      });
      migrer();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  } else {
    // Base déjà sans l'ancienne contrainte, mais peut-être créée avant
    // l'ajout des colonnes de livraison/annulation/règlement — les
    // ajouter individuellement si nécessaire (idempotent).
    const columns = db.prepare("PRAGMA table_info(factures)").all() as { name: string }[];
    const ajouterSiAbsente = (nom: string, definition: string) => {
      if (!columns.some((c) => c.name === nom)) db.exec(`ALTER TABLE factures ADD COLUMN ${definition}`);
    };
    ajouterSiAbsente("mode_reglement", "mode_reglement TEXT");
    ajouterSiAbsente("statut_livraison", "statut_livraison TEXT NOT NULL DEFAULT 'en_attente'");
    ajouterSiAbsente("livree_le", "livree_le TEXT");
    ajouterSiAbsente("annulee_le", "annulee_le TEXT");
    ajouterSiAbsente("annulee_par", "annulee_par TEXT REFERENCES utilisateurs(id)");
    ajouterSiAbsente("motif_annulation", "motif_annulation TEXT");
    // Correction : "une facture annulée déjà corrigée une fois ne doit
    // plus proposer Modifier" — évite une seconde correction à partir de
    // la même erreur déjà traitée.
    ajouterSiAbsente("corrigee_par_facture_id", "corrigee_par_facture_id TEXT REFERENCES factures(id)");
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_numero_actif ON factures (numero) WHERE annulee_le IS NULL;");
}

// ===========================================================
// SCHEMA v6 — multi-format produits
// ===========================================================

/**
 * Crée la table `modeles_produit` si elle n'existe pas encore. Idempotente
 * (CREATE TABLE IF NOT EXISTS suffira sur les nouvelles bases, mais la
 * migration doit aussi couvrir les bases existantes qui n'ont jamais eu
 * cette table dans schema.sql).
 */
function creerTableModelesProductsSiAbsente(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS modeles_produit (
      id          TEXT PRIMARY KEY,
      motif       TEXT NOT NULL,
      type        TEXT NOT NULL,
      deleted_at  TEXT,
      deleted_by  TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_modeles_produit_type ON modeles_produit (type);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_modeles_produit_updated_at ON modeles_produit (updated_at);");
}

/**
 * Ajoute la colonne `modele_id` à `produits` sur une base créée avant
 * cette évolution. Nullable — les lignes existantes sans modèle sont
 * migrées ensuite par `creerModelesPourProduitsExistants`.
 */
function ajouterModeleIdAuxProduitsSiAbsent(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(produits)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "modele_id")) {
    db.exec("ALTER TABLE produits ADD COLUMN modele_id TEXT REFERENCES modeles_produit(id)");
  }
}

/**
 * Ajoute l'index sur `produits.modele_id` (ne peut être créé qu'après que
 * la colonne existe, donc séparé de schema.sql).
 */
function ajouterIndexModeleIdProduitsSiAbsent(db: Database.Database): void {
  db.exec("CREATE INDEX IF NOT EXISTS idx_produits_modele_id ON produits (modele_id);");
}

/**
 * Pour chaque `produit` existant sans `modele_id`, crée (ou réutilise) un
 * modèle ayant le même (motif, type). Les variantes d'un même motif/type
 * sont ainsi regroupées sous un modèle commun. Idempotente.
 */
function creerModelesPourProduitsExistants(db: Database.Database): void {
  const produits = db
    .prepare("SELECT id, motif, type, created_at, updated_at FROM produits WHERE modele_id IS NULL")
    .all() as { id: string; motif: string; type: string; created_at: string; updated_at: string }[];
  if (produits.length === 0) return;

  const migrer = db.transaction(() => {
    for (const p of produits) {
      const existant = db
        .prepare("SELECT id FROM modeles_produit WHERE motif = ? AND type = ? AND deleted_at IS NULL LIMIT 1")
        .get(p.motif, p.type) as { id: string } | undefined;
      const modeleId = existant?.id ?? randomUUID();
      if (!existant) {
        db.prepare(
          "INSERT INTO modeles_produit (id, motif, type, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)"
        ).run(modeleId, p.motif, p.type, p.created_at, p.updated_at);
      }
      db.prepare("UPDATE produits SET modele_id = ? WHERE id = ?").run(modeleId, p.id);
    }
  });
  migrer();
}

/**
 * Migre `images_produit` de `produit_id` (variant-level) vers `modele_id`
 * (model-level). Détection : si la colonne `modele_id` est absente de la
 * table actuelle, la table est recréée avec la nouvelle structure et les
 * données existantes sont transférées via JOIN sur `produits.modele_id`
 * (les images dont le produit n'a pas encore de modèle sont perdues, mais
 * cela ne peut arriver qu'en cas d'incohérence grave — toujours après
 * `creerModelesPourProduitsExistants`). Idempotente.
 */
function migrerImagesVersModeles(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(images_produit)").all() as { name: string }[];
  if (columns.some((c) => c.name === "modele_id")) return; // Déjà migré.

  db.pragma("foreign_keys = OFF");
  try {
    const migrer = db.transaction(() => {
      db.exec(`
        CREATE TABLE images_produit_nouvelle (
          id           TEXT PRIMARY KEY,
          modele_id    TEXT NOT NULL REFERENCES modeles_produit (id),
          kind         TEXT NOT NULL CHECK (kind IN ('produit', 'logo')),
          chemin_local TEXT NOT NULL,
          url_cloud    TEXT,
          ordre        INTEGER NOT NULL DEFAULT 0,
          est_principale INTEGER NOT NULL DEFAULT 0 CHECK (est_principale IN (0, 1)),
          sync_status  TEXT NOT NULL CHECK (sync_status IN ('pending', 'sent', 'confirmed', 'error')),
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);
      db.exec(`
        INSERT INTO images_produit_nouvelle
          (id, modele_id, kind, chemin_local, url_cloud, ordre, est_principale, sync_status, created_at, updated_at)
        SELECT img.id, p.modele_id, img.kind, img.chemin_local, img.url_cloud,
               img.ordre, img.est_principale, img.sync_status, img.created_at, img.updated_at
        FROM images_produit img
        JOIN produits p ON img.produit_id = p.id
        WHERE p.modele_id IS NOT NULL;
      `);
      db.exec("DROP TABLE images_produit;");
      db.exec("ALTER TABLE images_produit_nouvelle RENAME TO images_produit;");
    });
    migrer();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
