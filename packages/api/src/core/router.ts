import type { ApiRequest, ApiResponse, Route } from "./types.js";
import { errorToResponse, NotFoundError, UnauthorizedError } from "./errors.js";
import { verifierJwt } from "./jwt.js";
import { getJwtSecret } from "./config.js";

const API_VERSION_PREFIX = "/v1";

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
 */
function authentifier(req: ApiRequest): { sub: string; role?: string } {
  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    throw new UnauthorizedError();
  }
  const [schema, token] = authHeader.split(" ");
  if (schema !== "Bearer" || !token) {
    throw new UnauthorizedError();
  }

  const resultat = verifierJwt(token, getJwtSecret());
  if (!resultat.valide) {
    // La raison précise (format/signature/expire/payload) n'est
    // jamais renvoyée au client — un message générique unique pour
    // toutes les causes de refus, afin de ne jamais donner d'indice
    // utile à quelqu'un qui tenterait de deviner un jeton valide.
    throw new UnauthorizedError();
  }

  return { sub: resultat.payload.sub, role: resultat.payload.role };
}

export class Router {
  private readonly routes: Route[] = [];

  register(route: Route): void {
    this.routes.push(route);
  }

  async dispatch(req: ApiRequest): Promise<ApiResponse> {
    try {
      if (!req.path.startsWith(API_VERSION_PREFIX)) {
        throw new NotFoundError(`Chemin sans préfixe de version reconnu : ${req.path}`);
      }
      const unprefixedPath = req.path.slice(API_VERSION_PREFIX.length) || "/";

      const route = this.routes.find((r) => r.method === req.method && r.path === unprefixedPath);
      if (!route) {
        throw new NotFoundError(`Aucune route ${req.method} ${req.path}`);
      }

      if (route.trustLevel === "app") {
        req.auth = authentifier(req);
      }

      return await route.handler(req);
    } catch (err) {
      return errorToResponse(err);
    }
  }
}
