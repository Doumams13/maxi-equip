import { createServer } from "node:http";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";

/**
 * Serveur de développement local — permet de lancer et tester l'API sans
 * dépendre d'un compte ou d'une CLI d'hébergeur cloud (le fournisseur
 * précis reste à choisir, cf. Synthèse §2). Ce fichier n'est PAS ce qui
 * sera déployé en production ; c'est une fine couche d'adaptation
 * jetable, exactement le principe posé pour limiter la dépendance au
 * fournisseur (Corrections §2).
 */

const PORT = Number(process.env["PORT"] ?? 8787);
const router = createRouter();

const server = createServer((nodeReq, nodeRes) => {
  const chunks: Buffer[] = [];
  nodeReq.on("data", (chunk) => chunks.push(chunk));
  nodeReq.on("end", () => {
    void (async () => {
      const url = new URL(nodeReq.url ?? "/", `http://${nodeReq.headers.host ?? "localhost"}`);
      const rawBody = Buffer.concat(chunks).toString("utf-8");

      const apiReq: ApiRequest = {
        method: (nodeReq.method as ApiRequest["method"]) ?? "GET",
        path: url.pathname,
        headers: Object.fromEntries(
          Object.entries(nodeReq.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
        ),
        query: Object.fromEntries(url.searchParams.entries()),
        body: rawBody ? JSON.parse(rawBody) : undefined,
      };

      const apiRes = await router.dispatch(apiReq);
      nodeRes.writeHead(apiRes.status, { "Content-Type": "application/json" });
      nodeRes.end(JSON.stringify(apiRes.body));
    })();
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API de développement locale MAXI EQUIP — http://localhost:${PORT}`);
});
