import type { IncomingMessage, ServerResponse } from "node:http";
import type { Router } from "./router.js";
import type { ApiRequest } from "./types.js";
import { errorToResponse, ValidationError } from "./errors.js";
import { enTetesCors, enTetesPreflight } from "./cors.js";
import { verifierAutorisationPoste } from "./autorisationPoste.js";
import { getPosteEventBus } from "./posteEventBus.js";

const CHEMIN_FLUX_SYNC = "/v1/app/sync/stream";
/** Battement de cœur SSE — garde la connexion active à travers les proxys/délais d'inactivité (voir deploy/nginx/maxi-equip.conf), permet aussi de détecter une connexion morte côté serveur. */
const INTERVALLE_BATTEMENT_MS = 25_000;

/**
 * Système multiposte fiable (2026-10-28), Phase F — flux SSE
 * (Server-Sent Events) pour la synchronisation quasi instantanée. Cas
 * particulier traité ICI, AVANT le tamponnage du corps habituel
 * ci-dessous : une connexion SSE reste ouverte indéfiniment, totalement
 * incompatible avec le modèle "tamponner la requête, dispatcher une
 * fois, répondre une fois" de `Router.dispatch()` — jamais fait passer
 * ce chemin par le routeur, ni par le contrat `ApiResponse` qu'il
 * suppose pour toutes les autres routes.
 *
 * Authentification/autorisation dupliquée ici (voir
 * core/autorisationPoste.ts, réutilisée À L'IDENTIQUE par
 * router.ts/authentifier()) — coût assumé de la solution la moins
 * invasive pour ce seul point d'entrée.
 *
 * Diffuse UNIQUEMENT un signal minimal ("quelque chose a changé, va
 * resynchroniser", voir posteEventBus.ts) — JAMAIS la donnée elle-même :
 * la notification d'une opération n'est jamais confondue avec son
 * application effective, qui reste strictement du ressort du cycle de
 * synchro normal déclenché côté client (voir syncStreamClient.ts).
 */
function gererFluxSynchronisation(nodeReq: IncomingMessage, nodeRes: ServerResponse, corsHeaders: Record<string, string>): void {
  void (async () => {
    const authHeader = Array.isArray(nodeReq.headers.authorization) ? nodeReq.headers.authorization[0] : nodeReq.headers.authorization;
    const resultat = await verifierAutorisationPoste(authHeader);
    if (!resultat.ok) {
      nodeRes.writeHead(resultat.status, { "Content-Type": "application/json", ...corsHeaders });
      nodeRes.end(JSON.stringify({ error: { code: "unauthorized", message: resultat.message } }));
      return;
    }

    nodeRes.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
    });
    // Commentaire SSE initial — force l'envoi immédiat des en-têtes/du
    // début de flux (certains clients/proxys retiennent sinon la
    // première écriture), jamais traité comme un évènement par
    // syncStreamClient.ts (qui ignore toute ligne commençant par ":").
    nodeRes.write(":ok\n\n");

    const desabonner = getPosteEventBus().enregistrer(resultat.sub, {
      notifier: (evenement) => {
        nodeRes.write(`data: ${JSON.stringify(evenement)}\n\n`);
      },
      fermer: () => {
        nodeRes.end();
      },
    });

    const battement = setInterval(() => {
      nodeRes.write(":battement\n\n");
    }, INTERVALLE_BATTEMENT_MS);

    const nettoyer = () => {
      clearInterval(battement);
      desabonner();
    };
    nodeReq.on("close", nettoyer);
    nodeRes.on("close", nettoyer);
  })();
}

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

    // Système multiposte fiable (2026-10-28), Phase F — voir
    // gererFluxSynchronisation ci-dessus. Vérifié avant le tamponnage du
    // corps ci-dessous (sans effet ici : une requête GET n'a jamais de
    // corps), pour que l'intention ("ceci est un flux, jamais une
    // requête JSON classique") soit explicite dès l'entrée.
    const cheminBrut = (nodeReq.url ?? "/").split("?")[0];
    if (nodeReq.method === "GET" && cheminBrut === CHEMIN_FLUX_SYNC) {
      gererFluxSynchronisation(nodeReq, nodeRes, enTetesCors(origine));
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
