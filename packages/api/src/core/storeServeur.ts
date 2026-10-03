import Database from "better-sqlite3-multiple-ciphers";
import { SqliteServerStorage } from "./sqliteServerStorage.js";
import { PostgresServerStorage } from "./postgresServerStorage.js";
import type { ServerStorage, OperationRecue, ResultatEnregistrement, ResultatPull } from "./serverStorage.js";

export type {
  TypeOperationSync,
  OperationRecue,
  OperationStockee,
  ResultatEnregistrement,
  ResultatPull,
} from "./serverStorage.js";

/**
 * Point d'accès unique à la persistance serveur — Bloc 1 (remédiation
 * pré-production, PostgreSQL).
 *
 * AVANT cette étape, ce module dépendait directement de
 * `better-sqlite3` : `DATABASE_URL` (PostgreSQL) était documentée depuis
 * la Phase 0 mais jamais connectée à quoi que ce soit (constat de
 * l'audit pré-production). Désormais, deux implémentations du même
 * contrat (`ServerStorage`, voir serverStorage.ts) coexistent :
 *  - `SqliteServerStorage` : développement, tests (`:memory:`), et
 *    secours si `DATABASE_URL` n'est pas configurée — comportement
 *    inchangé par rapport à avant cette étape.
 *  - `PostgresServerStorage` : production, utilisée dès que
 *    `DATABASE_URL` est fournie.
 *
 * Les routes (et tout le reste du code) continuent d'appeler EXACTEMENT
 * les mêmes fonctions qu'avant (`enregistrerOperations`,
 * `listerOperationsDepuis`) — jamais une dépendance directe à l'une ou
 * l'autre implémentation. Seule différence visible : ces fonctions sont
 * désormais asynchrones (nécessaire pour parler à un vrai serveur
 * PostgreSQL sur le réseau) — inchangé pour `catalogStore.ts`, qui
 * l'était déjà par construction de son contrat partagé.
 */

let stockage: ServerStorage | null = null;

/**
 * SQLite — développement et tests. `cheminFichier` : `:memory:` dans les
 * tests, un vrai chemin de fichier pour `local-dev-server.ts`.
 * Synchrone (ouverture SQLite immédiate) — préserve tous les sites
 * d'appel existants (`beforeEach(() => initialiserStockageServeur(...))`
 * sans `await`).
 */
export function initialiserStockageServeur(cheminFichier: string): void {
  stockage = new SqliteServerStorage(new Database(cheminFichier));
}

/** PostgreSQL — production. Asynchrone : établit la connexion et applique les migrations avant de rendre la main. */
export async function initialiserStockageServeurPostgres(connectionString: string): Promise<void> {
  const postgres = new PostgresServerStorage(connectionString);
  await postgres.migrer();
  stockage = postgres;
}

/**
 * Sélectionne automatiquement l'implémentation selon l'environnement —
 * utilisée par `production-server.ts` : PostgreSQL si `DATABASE_URL` est
 * définie, sinon SQLite (repli développement, `SYNC_DB_PATH`) — jamais
 * un mélange silencieux des deux dans le même processus.
 */
export async function initialiserPersistanceDepuisEnvironnement(): Promise<{ backend: "postgres" | "sqlite" }> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl && databaseUrl.trim()) {
    await initialiserStockageServeurPostgres(databaseUrl);
    return { backend: "postgres" };
  }
  initialiserStockageServeur(process.env["SYNC_DB_PATH"] ?? "./sync-dev.sqlite");
  return { backend: "sqlite" };
}

export async function fermerStockageServeur(): Promise<void> {
  if (stockage) {
    await stockage.fermer();
    stockage = null;
  }
}

function getStockage(): ServerStorage {
  if (!stockage) throw new Error("Stockage serveur non initialisé — appeler initialiserStockageServeur() ou initialiserStockageServeurPostgres() au démarrage.");
  return stockage;
}

/** Réservé aux autres modules `core/*` (ex. `catalogStore.ts`) qui doivent réutiliser la même implémentation active — jamais une seconde instance. */
export function getStorage(): ServerStorage {
  return getStockage();
}

export async function enregistrerOperations(operations: OperationRecue[]): Promise<ResultatEnregistrement[]> {
  return getStockage().enregistrerOperations(operations);
}

export async function listerOperationsDepuis(curseur: number, limite = 200): Promise<ResultatPull> {
  return getStockage().listerOperationsDepuis(curseur, limite);
}
