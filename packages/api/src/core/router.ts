import type { ApiRequest, ApiResponse, Route } from "./types.js";
import { errorToResponse, NotFoundError, UnauthorizedError } from "./errors.js";

const API_VERSION_PREFIX = "/v1";

/**
 * Vérification d'authentification pour les routes de niveau "app".
 *
 * PHASE 0 : vérifie uniquement la PRÉSENCE d'un jeton dans l'en-tête
 * Authorization, pour que la distinction des deux niveaux de confiance
 * (Synthèse §5) soit réellement appliquée et testable dès maintenant.
 * La validation cryptographique réelle du jeton de session (émission,
 * expiration, révocation — Synthèse §2/§8, Corrections §1) sera implémentée
 * en Phase 1, sans changer ce point d'accroche.
 */
function assertAuthenticated(req: ApiRequest): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError();
  }
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
        assertAuthenticated(req);
      }

      return await route.handler(req);
    } catch (err) {
      return errorToResponse(err);
    }
  }
}
