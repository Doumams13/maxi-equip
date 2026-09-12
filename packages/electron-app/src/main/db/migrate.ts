import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
// Importé comme texte brut par le bundler (Vite/electron-vite) — voir electron.vite.config.ts.
import schemaSql from "./schema.sql?raw";

/**
 * Applique le schéma initial (idempotent — CREATE TABLE IF NOT EXISTS),
 * puis les évolutions de schéma ultérieures, elles aussi idempotentes et
 * jamais destructrices (§14 du prompt Phase 0 : "ne détruit aucune donnée
 * existante").
 */
export function runMigrations(db: Database.Database): void {
  db.exec(schemaSql);
  addEstPrincipaleColumnIfMissing(db);
  fixReferenceUniqueConstraint(db);
  addLargeurHauteurColumnsIfMissing(db);
  addActifColumnToEmplacementsIfMissing(db);
  addResponsablesColumnsIfMissing(db);
  createSyncTablesIfMissing(db);
  addUtilisateurIdToMouvementsIfMissing(db);
  migrateFacturesPourAnnulationEtLivraison(db);
  seedParametresEntrepriseSiAbsent(db);
  migrerTelephoneUniqueVersTable(db);
  ajouterSourceEntityIdDemandesSiAbsent(db);
  setSchemaVersion(db);
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
export const SCHEMA_VERSION = 2;

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
      db.exec(`
        INSERT INTO produits_nouveau
          (id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, deleted_at, deleted_by, created_at, updated_at)
        SELECT id, motif, type, taille, taille_tri, reference, prix, seuil_alerte, deleted_at, deleted_by, created_at, updated_at
        FROM produits;
      `);
      db.exec("DROP TABLE produits;");
      db.exec("ALTER TABLE produits_nouveau RENAME TO produits;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_produits_taille_tri ON produits (taille_tri);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_produits_updated_at ON produits (updated_at);");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_produits_reference_actif ON produits (reference) WHERE deleted_at IS NULL;");
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
      recu_le TEXT NOT NULL
    );
  `);
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
            created_at             TEXT NOT NULL,
            updated_at             TEXT NOT NULL
          );
        `);
        db.exec(`
          INSERT INTO factures_nouveau
            (id, numero, date, emplacement_id, client_nom, client_telephone, client_adresse,
             vendeur_utilisateur_id, vendeur_nom_manuel, total, created_at, updated_at)
          SELECT id, numero, date, emplacement_id, client_nom, client_telephone, client_adresse,
                 vendeur_utilisateur_id, vendeur_nom_manuel, total, created_at, updated_at
          FROM factures;
        `);
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
