import type { ApiRequest, ApiResponse, Route } from "./types.js";
import { errorToResponse, NotFoundError, UnauthorizedError, ForbiddenError, ServiceUnavailableError } from "./errors.js";
import { verifierAutorisationPoste } from "./autorisationPoste.js";

const API_VERSION_PREFIX = "/v1";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RATE LIMITING — correction "Phase 3.5.1 — Consolidation API", Partie 7
 * ═══════════════════════════════════════════════════════════════════
 * ANALYSE : l'API n'est actuellement PAS exposée publiquement — elle
 * tourne uniquement en développement local (`local-dev-server.ts`),
 * jamais déployée, jamais appelée par `electron-app` (confirmé lors de
 * l'audit Phase 3 par recherche exhaustive). Aucune infrastructure de
 * rate limiting n'existe et aucune n'est créée par cette étape — un
 * système complexe serait prématuré tant qu'aucun trafic réel n'existe.
 *
 * RATE LIMITING OBLIGATOIRE AVANT EXPOSITION PUBLIQUE. À implémenter
 * impérativement avant que cette API ne soit accessible depuis un
 * réseau non maîtrisé (au minimum sur les tentatives d'authentification
 * échouées, pour limiter une attaque par force brute sur un jeton).
 *
 * ═══════════════════════════════════════════════════════════════════
 * RÉVOCATION DE JWT — Partie 8 — IMPLÉMENTÉE (système multiposte
 * fiable, 2026-10-28), exactement comme anticipé ci-dessus
 * historiquement : plusieurs postes existent désormais (voir
 * serverStorage.ts/PosteRow, Phase C), chacun identifié par le `sub` de
 * son jeton applicatif. Plutôt qu'une table `jetons_revoques` séparée
 * (solution alors envisagée), la vérification se fait directement sur
 * `postes.statut` — un jeton révoqué EST un jeton dont le poste est
 * `bloque`, jamais une notion distincte à synchroniser en plus.
 *
 * `authentifier()` reste purement cryptographique pour le format/la
 * signature/l'expiration (401 inchangé pour ces cas) ; la vérification
 * d'AUTORISATION (poste bloqué → 403) est une étape SUPPLÉMENTAIRE,
 * après coup — c'est exactement la distinction 401/403 déjà documentée
 * ci-dessous, préparée à l'avance pour ce cas précis.
 */

/**
 * Middleware d'authentification CENTRALISÉ pour les routes de niveau
 * "app" (correction "Phase 3.5 — Sécurisation de l'API", Partie 4) —
 * jamais dupliqué dans chaque route individuellement.
 *
 * REMPLACE l'ancienne vérification de PHASE 0, qui se contentait de
 * vérifier la PRÉSENCE d'un en-tête `Authorization: Bearer ...` sans
 * jamais examiner le contenu du jeton — n'importe quelle chaîne de
 * caractères après "Bearer " était acceptée. Ce n'est plus le cas :
 * le jeton est désormais un vrai JWT HS256, réellement vérifié
 * (format, signature à temps constant, expiration si présente).
 *
 * Toujours 401 pour un problème d'authentification (absent, mal formé,
 * signature invalide, expiré) — jamais 403, réservé à un jeton
 * valide mais insuffisant pour l'action demandée (aucune route de ce
 * type n'existe encore, la distinction reste prête pour plus tard).
 * Aucun détail interne (secret, raison technique précise) n'est jamais
 * inclus dans la réponse — uniquement un message générique côté client,
 * la raison précise restant disponible côté serveur pour du diagnostic
 * futur si nécessaire (jamais journalisée ici pour l'instant, aucun
 * système de journalisation n'existe encore dans ce package).
 *
 * Système multiposte fiable (2026-10-28) — la vérification elle-même
 * (JWT puis statut du poste) vit désormais dans
 * `core/autorisationPoste.ts`, réutilisée À L'IDENTIQUE par
 * `httpAdapter.ts` (flux SSE, Phase F, qui ne passe jamais par
 * `Router.dispatch()`) — jamais une seconde logique inventée pour ce
 * second chemin. Cette fonction ne fait plus que traduire le résultat
 * en l'exception HTTP attendue par `dispatch()` ci-dessous.
 */
async function authentifier(req: ApiRequest): Promise<{ sub: string; role?: string }> {
  const resultat = await verifierAutorisationPoste(req.headers["authorization"]);
  if (!resultat.ok) {
    if (resultat.status === 403) throw new ForbiddenError(resultat.message);
    if (resultat.status === 503) throw new ServiceUnavailableError(resultat.message);
    // Message générique par défaut (jamais resultat.message pour ce cas
    // précis) — aucun indice utile à quelqu'un qui tenterait de deviner
    // un jeton valide, exactement le comportement historique ci-dessus.
    throw new UnauthorizedError();
  }
  return { sub: resultat.sub, role: resultat.role };
}

export class Router {
  private readonly routes: Route[] = [];

  register(route: Route): void {
    this.routes.push(route);
  }

  async dispatch(req: ApiRequest): Promise<ApiResponse> {
    try {
      // Correction Phase Finale (audit pré-production, §3) : point de
      // santé NON versionné et NON préfixé — convention attendue par un
      // reverse proxy / orchestrateur de conteneurs (Docker HEALTHCHECK,
      // load balancer) à la racine, jamais sous /v1. Volontairement
      // avant la vérification du préfixe de version ci-dessous (qui
      // rejetterait sinon "/health" avec un 404), et avant toute
      // authentification — ne renvoie rien de sensible.
      if (req.path === "/health" && req.method === "GET") {
        return { status: 200, body: { status: "ok" } };
      }

      if (!req.path.startsWith(API_VERSION_PREFIX)) {
        throw new NotFoundError(`Chemin sans préfixe de version reconnu : ${req.path}`);
      }
      const unprefixedPath = req.path.slice(API_VERSION_PREFIX.length) || "/";

      const route = this.routes.find((r) => r.method === req.method && r.path === unprefixedPath);
      if (!route) {
        throw new NotFoundError(`Aucune route ${req.method} ${req.path}`);
      }

      if (route.trustLevel === "app") {
        req.auth = await authentifier(req);
      }

      return await route.handler(req);
    } catch (err) {
      return errorToResponse(err);
    }
  }
}
