import type { Route } from "../../../../core/types.js";
import { ApiError, UnauthorizedError, ValidationError } from "../../../../core/errors.js";
import { verifierLimitation } from "../../../../core/rateLimiter.js";
import { trouverCompteParIdentifiant } from "../../../../core/compteStore.js";
import { hasherMotDePasse, verifierMotDePasse } from "../../../../core/argon2Hasher.js";
import { signerJwt } from "../../../../core/jwt.js";
import { getJwtSecret } from "../../../../core/config.js";

/**
 * POST /v1/app/auth/login — correction "travail à distance / plusieurs
 * machines en parallèle" (2026-10-22). Permet à un compte créé par
 * l'Administrateur (sur n'importe quel poste) de se connecter depuis
 * n'importe quel AUTRE poste — voir authService.ts côté Electron, qui
 * appelle cette route uniquement quand la synchronisation est configurée
 * sur ce poste (sinon connexion 100% locale inchangée, décision
 * utilisateur explicite).
 *
 * `trustLevel: "app"` — nécessite déjà un jeton d'INSTALLATION valide
 * (même garde que toutes les autres routes "app"), en plus de
 * l'identifiant/mot de passe du COMPTE : un poste qui n'a jamais été
 * configuré avec la synchronisation ne peut même pas tenter cette route,
 * jamais exposée à un trafic internet anonyme non authentifié.
 *
 * Limitation de fréquence par (identifiant + IP) — jamais par IP seule,
 * qui pénaliserait tout un poste après l'échec sur UN SEUL compte alors
 * qu'un autre utilisateur du même poste se connecte normalement au même
 * moment.
 *
 * Message d'échec STRICTEMENT identique pour les trois cas (compte
 * inconnu, mot de passe incorrect, compte désactivé) — jamais d'indice
 * sur laquelle de ces raisons s'applique. Un hash "factice" est vérifié
 * même quand le compte n'existe pas, pour que le temps de réponse ne
 * révèle pas non plus si l'identifiant existe (même principe que
 * `timingSafeEqual` déjà utilisé pour la signature JWT, voir jwt.ts).
 */

const LIMITE_TENTATIVES = 5;
const FENETRE_LIMITE_MS = 15 * 60 * 1000;
const DUREE_SESSION_SECONDES = 12 * 60 * 60;

let hashFactice: Promise<string> | null = null;
function getHashFactice(): Promise<string> {
  if (!hashFactice) hashFactice = hasherMotDePasse("mot-de-passe-factice-jamais-utilise-pour-egaliser-le-temps-de-reponse");
  return hashFactice;
}

export const authLoginRoute: Route = {
  method: "POST",
  path: "/app/auth/login",
  trustLevel: "app",
  handler: async (req) => {
    const body = req.body as { identifiant?: unknown; motDePasse?: unknown } | undefined;
    if (!body || typeof body.identifiant !== "string" || body.identifiant.length === 0 || typeof body.motDePasse !== "string" || body.motDePasse.length === 0) {
      throw new ValidationError("identifiant et motDePasse (chaînes non vides) sont requis.");
    }

    const cle = `${body.identifiant.toLowerCase()}:${req.ip ?? "inconnue"}`;
    const limitation = verifierLimitation(cle, LIMITE_TENTATIVES, FENETRE_LIMITE_MS);
    if (!limitation.autorise) {
      throw new ApiError(429, "rate_limited", `Trop de tentatives de connexion. Réessayez dans ${limitation.reessayerDansSecondes} secondes.`);
    }

    const compte = await trouverCompteParIdentifiant(body.identifiant);
    const hashAVerifier = compte?.hashMotDePasse ?? (await getHashFactice());
    const motDePasseValide = await verifierMotDePasse(body.motDePasse, hashAVerifier);

    if (!compte || !compte.actif || !motDePasseValide) {
      throw new UnauthorizedError("Identifiant ou mot de passe incorrect.");
    }

    const jwt = signerJwt({ sub: compte.id, role: compte.role }, getJwtSecret(), DUREE_SESSION_SECONDES);
    return {
      status: 200,
      body: { success: true, jwt, compte: { id: compte.id, identifiant: compte.identifiant, nom: compte.nom, role: compte.role } },
    };
  },
};
