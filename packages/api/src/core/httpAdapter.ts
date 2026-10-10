import type { IncomingMessage, ServerResponse } from "node:http";
import type { Router } from "./router.js";
import type { ApiRequest } from "./types.js";
import { errorToResponse, ValidationError } from "./errors.js";
import { enTetesCors, enTetesPreflight } from "./cors.js";

/**
 * Adaptateur HTTP Node natif, partagé entre `local-dev-server.ts` et
 * `production-server.ts` — correction Phase Finale (audit pré-production) :
 * avant cette extraction, cette logique n'existait QUE dans
 * `local-dev-server.ts` (explicitement documenté comme non destiné à la
 * production), et aucun point d'entrée de production n'existait du tout.
 * Extraite ici pour que les deux serveurs se comportent EXACTEMENT de la
 * même façon (CORS, /health, gestion d'erreur JSON) — jamais deux copies
 * qui risqueraient de diverger silencieusement.
 */
export function creerGestionnaireHttp(router: Router): (nodeReq: IncomingMessage, nodeRes: ServerResponse) => void {
  return (nodeReq, nodeRes) => {
    const origine = Array.isArray(nodeReq.headers.origin) ? nodeReq.headers.origin[0] : nodeReq.headers.origin;

    if (nodeReq.method === "OPTIONS") {
      nodeRes.writeHead(204, enTetesPreflight(origine));
      nodeRes.end();
      return;
    }

    const chunks: Buffer[] = [];
    nodeReq.on("data", (chunk) => chunks.push(chunk));
    nodeReq.on("end", () => {
      void (async () => {
        const url = new URL(nodeReq.url ?? "/", `http://${nodeReq.headers.host ?? "localhost"}`);
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        const corsHeaders = enTetesCors(origine);

        let body: unknown;
        try {
          // BUG RÉEL CORRIGÉ (Phase 3.6, Partie 4 — "JSON invalide" doit
          // renvoyer 400, jamais faire planter le serveur).
          body = rawBody ? JSON.parse(rawBody) : undefined;
        } catch {
          const erreur = errorToResponse(new ValidationError("Corps de requête JSON invalide."));
          nodeRes.writeHead(erreur.status, { "Content-Type": "application/json", ...corsHeaders });
          nodeRes.end(JSON.stringify(erreur.body));
          return;
        }

        // Derrière le reverse proxy Nginx (voir deploy/nginx/*.conf), le
        // processus API ne voit jamais que 127.0.0.1 comme adresse de
        // socket — l'adresse RÉELLE du client vient de X-Forwarded-For
        // (ajouté par Nginx : proxy_set_header X-Forwarded-For ...).
        // Sans ce correctif, tout le rate limiting par IP (voir
        // rateLimiter.ts) traiterait tous les clients comme un seul —
        // bug réel, corrigé avant que la première route publique
        // sensible (récupération d'installation) n'en dépende.
        const forwardedFor = nodeReq.headers["x-forwarded-for"];
        const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0]?.trim();

        const apiReq: ApiRequest = {
          method: (nodeReq.method as ApiRequest["method"]) ?? "GET",
          path: url.pathname,
          headers: Object.fromEntries(Object.entries(nodeReq.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
          query: Object.fromEntries(url.searchParams.entries()),
          body,
          ip: forwardedIp || nodeReq.socket.remoteAddress,
        };

        const apiRes = await router.dispatch(apiReq);
        if (apiRes.raw) {
          nodeRes.writeHead(apiRes.status, { "Content-Type": apiRes.raw.contentType, ...corsHeaders, ...apiRes.headers });
          nodeRes.end(apiRes.raw.data);
          return;
        }
        nodeRes.writeHead(apiRes.status, { "Content-Type": "application/json", ...corsHeaders, ...apiRes.headers });
        nodeRes.end(JSON.stringify(apiRes.body));
      })();
    });
  };
}
