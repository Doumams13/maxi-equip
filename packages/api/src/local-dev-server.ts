import { createServer } from "node:http";
import { createRouter } from "./index.js";
import { initialiserStockageServeur } from "./core/storeServeur.js";
import { creerGestionnaireHttp } from "./core/httpAdapter.js";

/**
 * Serveur de développement local — permet de lancer et tester l'API sans
 * dépendre d'un compte ou d'une CLI d'hébergeur cloud (le fournisseur
 * précis reste à choisir, cf. Synthèse §2). Ce fichier n'est PAS ce qui
 * sera déployé en production (voir production-server.ts) ; c'est une
 * fine couche d'adaptation jetable, exactement le principe posé pour
 * limiter la dépendance au fournisseur (Corrections §2).
 */

const PORT = Number(process.env["PORT"] ?? 8787);
// Fichier local par défaut — remplaçable par un vrai serveur de base de
// données en production sans changer les routes (voir core/storeServeur.ts).
initialiserStockageServeur(process.env["SYNC_DB_PATH"] ?? "./sync-dev.sqlite");
const router = createRouter();

const server = createServer(creerGestionnaireHttp(router));

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API de développement locale MAXI EQUIP — http://localhost:${PORT}`);
});
