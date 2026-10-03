import { createServer } from "node:http";
import { createRouter } from "./index.js";
import { initialiserStockageServeur, initialiserStockageServeurPostgres, fermerStockageServeur } from "./core/storeServeur.js";
import { creerGestionnaireHttp } from "./core/httpAdapter.js";

/**
 * Point d'entrée de production — Phase Finale (audit pré-production) :
 * AVANT cette étape, seul `local-dev-server.ts` existait, explicitement
 * documenté comme "pas ce qui sera déployé en production". Ce fichier
 * réutilise EXACTEMENT le même contrat (`Router`, `ApiRequest`/
 * `ApiResponse`, même adaptateur HTTP — voir `core/httpAdapter.ts`) —
 * aucune route, aucune logique métier n'est dupliquée ni réécrite.
 * Différences volontaires par rapport au serveur de développement :
 *  - configuration explicite requise (pas de valeur de secours) ;
 *  - arrêt propre sur SIGTERM/SIGINT (obligatoire derrière un
 *    orchestrateur de conteneurs, qui envoie SIGTERM avant de tuer le
 *    processus) ;
 *  - aucune donnée sensible dans les journaux de démarrage/arrêt.
 *
 * Destiné à tourner DERRIÈRE un reverse proxy HTTPS (§14) — ce processus
 * lui-même n'écoute qu'en clair HTTP sur le réseau interne, TLS étant
 * terminé par le reverse proxy (nginx/Caddy/etc.), jamais géré ici.
 */

const PORT = Number(process.env["PORT"] ?? 8787);

/**
 * Bloc 1 (remédiation pré-production, PostgreSQL) : PostgreSQL dès que
 * `DATABASE_URL` est défini — c'est désormais le backend RÉEL attendu en
 * production (architecture cible : Electron SQLite → API → PostgreSQL →
 * Site). Secours SQLite conservé UNIQUEMENT si `DATABASE_URL` est
 * absent, avec la même exigence stricte qu'avant (aucune valeur de
 * secours implicite pour `SYNC_DB_PATH` non plus) — jamais un démarrage
 * avec une configuration ambiguë en production.
 */
async function demarrer(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl && databaseUrl.trim()) {
    await initialiserStockageServeurPostgres(databaseUrl);
    // eslint-disable-next-line no-console
    console.log("Stockage serveur : PostgreSQL.");
  } else {
    const cheminBaseDonnees = process.env["SYNC_DB_PATH"];
    if (!cheminBaseDonnees) {
      // eslint-disable-next-line no-console
      console.error("Ni DATABASE_URL ni SYNC_DB_PATH ne sont définis — au moins l'un des deux est requis explicitement en production. Arrêt.");
      process.exit(1);
    }
    initialiserStockageServeur(cheminBaseDonnees);
    // eslint-disable-next-line no-console
    console.log("Stockage serveur : SQLite (secours — DATABASE_URL non définie).");
  }

  const router = createRouter();
  const server = createServer(creerGestionnaireHttp(router));

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API MAXI EQUIP démarrée sur le port ${PORT}.`);
  });

  function arreterProprement(signal: string): void {
    // eslint-disable-next-line no-console
    console.log(`Signal ${signal} reçu — arrêt propre en cours...`);
    server.close(() => {
      void fermerStockageServeur().finally(() => process.exit(0));
    });
    // Filet de sécurité : si des connexions ouvertes empêchent server.close()
    // de se terminer, ne jamais bloquer indéfiniment un arrêt demandé par
    // l'orchestrateur (qui tuera le processus de force de toute façon après
    // son propre délai — mieux vaut fermer la base proprement avant).
    setTimeout(() => {
      void fermerStockageServeur().finally(() => process.exit(0));
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => arreterProprement("SIGTERM"));
  process.on("SIGINT", () => arreterProprement("SIGINT"));
}

demarrer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Échec du démarrage de l'API :", err instanceof Error ? err.message : err);
  process.exit(1);
});
