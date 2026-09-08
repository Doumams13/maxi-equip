import type Database from "better-sqlite3-multiple-ciphers";
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
  addUtilisateurIdToMouvementsIfMissing(db);
  migrateFacturesPourAnnulationEtLivraison(db);
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
