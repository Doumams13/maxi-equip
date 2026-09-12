import Database from "better-sqlite3-multiple-ciphers";

/**
 * Stockage serveur — Phase 3.6, Partie 1 (audit préalable) : aucune base
 * serveur n'existait avant cette étape. `DATABASE_URL` (PostgreSQL)
 * n'était que documentée dans `.env.example` depuis la Phase 0, jamais
 * connectée à quoi que ce soit. Plutôt que d'introduire une nouvelle
 * technologie non éprouvée dans ce projet pour cette première version,
 * ce module réutilise `better-sqlite3-multiple-ciphers` — déjà utilisé
 * et validé pour `electron-app`, et déjà installé dans ce monorepo.
 *
 * REMPLAÇABLE PLUS TARD par PostgreSQL sans changer le contrat des
 * routes : ce module n'expose que des fonctions (`enregistrerOperations`,
 * `listerOperationsDepuis`), jamais une dépendance directe à SQLite dans
 * les routes elles-mêmes — la même discipline provider-agnostique déjà
 * appliquée à `local-dev-server.ts`.
 */

export type TypeOperationSync = "vente" | "annulation" | "entree" | "transfert" | "demande";

export interface OperationRecue {
  entityType: TypeOperationSync;
  entityId: string;
  payload: unknown;
}

export interface OperationStockee {
  curseur: number;
  entityType: string;
  entityId: string;
  payload: unknown;
  recuLe: string;
}

export interface ResultatEnregistrement {
  entityId: string;
  statut: "cree" | "deja_traite";
}

let db: Database.Database | null = null;

/** Ouvre (ou crée) la base serveur. `:memory:` dans les tests, un vrai chemin de fichier pour local-dev-server.ts. */
export function initialiserStockageServeur(cheminFichier: string): Database.Database {
  db = new Database(cheminFichier);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS operations_synchronisees (
      curseur     INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      recu_le     TEXT NOT NULL,
      UNIQUE (entity_type, entity_id)
    );
  `);
  return db;
}

export function fermerStockageServeur(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error("Stockage serveur non initialisé — appeler initialiserStockageServeur() au démarrage.");
  return db;
}

/**
 * IDEMPOTENCE (Phase 3.6, Partie 6) — solution retenue : une contrainte
 * `UNIQUE (entity_type, entity_id)`, unique et suffisante, jamais un
 * mécanisme concurrent supplémentaire. `entity_id` est l'UUID technique
 * DÉJÀ existant de l'entité locale réelle (la facture, le mouvement —
 * le même que celui déjà utilisé dans `boite_envoi`, Phase 3.3) —
 * jamais un nouvel identifiant inventé. Une deuxième tentative avec le
 * même couple (type, id) est reconnue par la contrainte elle-même :
 * `INSERT OR IGNORE` ne produit aucune erreur, ne crée aucune ligne
 * supplémentaire, et le résultat le confirme explicitement.
 *
 * TRANSACTION (Partie 7) : le lot entier est traité de façon atomique.
 */
export function enregistrerOperations(operations: OperationRecue[]): ResultatEnregistrement[] {
  const base = getDb();
  const maintenant = new Date().toISOString();
  const inserer = base.prepare(
    "INSERT OR IGNORE INTO operations_synchronisees (entity_type, entity_id, payload_json, recu_le) VALUES (?, ?, ?, ?)"
  );

  const executerLot = base.transaction((lot: OperationRecue[]) => {
    const resultats: ResultatEnregistrement[] = [];
    for (const operation of lot) {
      const resultat = inserer.run(operation.entityType, operation.entityId, JSON.stringify(operation.payload), maintenant);
      resultats.push({ entityId: operation.entityId, statut: resultat.changes > 0 ? "cree" : "deja_traite" });
    }
    return resultats;
  });

  return executerLot(operations);
}

/** PULL — curseur = le dernier `curseur` déjà reçu par l'appelant ; renvoie tout ce qui a été enregistré après. */
export function listerOperationsDepuis(curseur: number, limite = 200): OperationStockee[] {
  const base = getDb();
  const lignes = base
    .prepare("SELECT curseur, entity_type, entity_id, payload_json, recu_le FROM operations_synchronisees WHERE curseur > ? ORDER BY curseur ASC LIMIT ?")
    .all(curseur, limite) as { curseur: number; entity_type: string; entity_id: string; payload_json: string; recu_le: string }[];
  return lignes.map((l) => ({
    curseur: l.curseur,
    entityType: l.entity_type,
    entityId: l.entity_id,
    payload: JSON.parse(l.payload_json),
    recuLe: l.recu_le,
  }));
}
