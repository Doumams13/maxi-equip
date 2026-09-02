import type { ApiResponse } from "./types.js";

/**
 * Gestion des erreurs standardisée (point 9 du prompt Phase 0). Chaque
 * route lève une de ces erreurs typées plutôt que de construire elle-même
 * une réponse HTTP — garantit un format d'erreur cohérent sur toute l'API.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, "validation_error", message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentification requise ou jeton invalide.") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Accès refusé pour ce niveau de confiance.") {
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Ressource introuvable.") {
    super(404, "not_found", message);
  }
}

export function errorToResponse(err: unknown): ApiResponse {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  // Erreur non anticipée : ne jamais renvoyer le détail interne au client.
  // eslint-disable-next-line no-console
  console.error("Erreur interne non gérée :", err);
  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Une erreur interne est survenue." } },
  };
}
