/**
 * Couche de traduction erreur technique → message utilisateur (Phase 1 —
 * système de notifications). Aucune erreur technique (IPC, Electron,
 * Node.js, stack trace) ne doit jamais atteindre l'interface directement
 * — cette fonction est le SEUL endroit où l'on décide du message à
 * afficher, à partir d'un détail technique qui, lui, reste réservé aux
 * logs développeur (console).
 *
 * Ne modifie ni ne remplace la logique d'authentification elle-même —
 * cette couche s'applique uniquement à la présentation du résultat.
 */

export interface UserFacingMessage {
  title: string;
  message: string;
}

/**
 * Cahier des charges de cette traduction (demande explicite) : ne jamais
 * préciser si c'est l'identifiant ou le mot de passe qui est incorrect,
 * ni révéler qu'un compte existe mais est désactivé (même principe de
 * prudence, pour ne pas donner d'indice à quelqu'un qui devine).
 */
const GENERIC_LOGIN_FAILURE: UserFacingMessage = {
  title: "Échec de connexion",
  message: "L'identifiant ou le mot de passe est incorrect.",
};

const UNEXPECTED_ERROR: UserFacingMessage = {
  title: "Connexion impossible",
  message: "Une erreur inattendue s'est produite. Veuillez réessayer.",
};

/**
 * Correction "travail à distance / plusieurs machines en parallèle"
 * (2026-10-22) — ces deux motifs viennent de la connexion EN LIGNE
 * (voir authService.ts/loginEnLigne) : contrairement aux trois motifs
 * historiques ci-dessous, ils ne doivent PAS afficher le message
 * générique (ce n'est ni un identifiant ni un mot de passe incorrect) —
 * le message précis vient du serveur (ex. délai d'attente réel).
 */
function messageConnexionCentrale(reason: string, message: string | undefined): UserFacingMessage | null {
  if (reason === "CONNEXION_REQUISE") {
    return { title: "Connexion internet requise", message: message ?? "Ce poste nécessite une connexion internet pour se connecter." };
  }
  if (reason === "TROP_DE_TENTATIVES") {
    return { title: "Trop de tentatives", message: message ?? "Trop de tentatives de connexion — réessayez plus tard." };
  }
  return null;
}

/** Traduit un motif d'échec d'authentification connu (retour normal du domaine, pas une exception). */
export function mapAuthFailureReason(reason: string, message?: string): UserFacingMessage {
  const central = messageConnexionCentrale(reason, message);
  if (central) return central;

  switch (reason) {
    case "USER_NOT_FOUND":
    case "WRONG_PASSWORD":
    case "USER_INACTIVE":
      // Volontairement le même message pour les trois cas — ne jamais
      // laisser deviner si l'identifiant existe ou si le compte est
      // simplement désactivé.
      return GENERIC_LOGIN_FAILURE;
    default:
      return UNEXPECTED_ERROR;
  }
}

/**
 * Traduit une erreur technique inattendue (exception IPC/Electron/Node —
 * ex. "Error invoking remote method 'auth:login': ..."). Le détail
 * technique est journalisé (console.error, logs développeur), jamais
 * affiché à l'utilisateur.
 */
export function mapUnexpectedError(err: unknown): UserFacingMessage {
  // eslint-disable-next-line no-console
  console.error("[auth] Erreur technique inattendue :", err);
  return UNEXPECTED_ERROR;
}

export const FIELD_REQUIRED_MESSAGES = {
  identifiant: { title: "Identifiant requis", message: "Veuillez saisir votre identifiant." } satisfies UserFacingMessage,
  motDePasse: { title: "Mot de passe requis", message: "Veuillez saisir votre mot de passe." } satisfies UserFacingMessage,
};
