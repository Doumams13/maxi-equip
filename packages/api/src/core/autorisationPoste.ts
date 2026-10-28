import { verifierJwt } from "./jwt.js";
import { getJwtSecret } from "./config.js";
import { getStorage } from "./storeServeur.js";

export type ResultatAutorisationPoste =
  | { ok: true; sub: string; role?: string }
  | { ok: false; status: 401 | 403 | 503; message: string };

/**
 * Vérification JWT + statut du poste — extraite de router.ts (système
 * multiposte fiable, 2026-10-28, Phase D), réutilisée À L'IDENTIQUE par
 * httpAdapter.ts (flux SSE, Phase F) : ce second chemin ne passe jamais
 * par `Router.dispatch()` (connexion longue durée, incompatible avec
 * son modèle tamponner-puis-répondre-une-fois) — jamais une seconde
 * logique de vérification inventée pour lui, voir router.ts/
 * authentifier() pour le raisonnement complet (distinction 401/403/503).
 */
export async function verifierAutorisationPoste(authHeader: string | undefined): Promise<ResultatAutorisationPoste> {
  if (!authHeader || typeof authHeader !== "string") {
    return { ok: false, status: 401, message: "Authentification requise ou jeton invalide." };
  }
  const [schema, token] = authHeader.split(" ");
  if (schema !== "Bearer" || !token) {
    return { ok: false, status: 401, message: "Authentification requise ou jeton invalide." };
  }

  const resultat = verifierJwt(token, getJwtSecret());
  if (!resultat.valide) {
    return { ok: false, status: 401, message: "Authentification requise ou jeton invalide." };
  }

  let poste;
  try {
    poste = await getStorage().getPoste(resultat.payload.sub);
  } catch {
    return { ok: false, status: 503, message: "Vérification d'autorisation momentanément indisponible — réessayez." };
  }
  if (poste && poste.statut === "bloque") {
    return { ok: false, status: 403, message: "Ce poste a été bloqué par un administrateur." };
  }

  return { ok: true, sub: resultat.payload.sub, role: resultat.payload.role };
}
