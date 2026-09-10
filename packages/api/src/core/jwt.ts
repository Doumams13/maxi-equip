import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * JWT minimal — signature HMAC-SHA256 uniquement (algorithme "HS256"),
 * implémenté avec `node:crypto` natif plutôt qu'une nouvelle dépendance
 * (`jsonwebtoken`/`jose`) — cohérent avec le choix déjà fait pour le
 * reste du projet (routeur maison, UUID via `node:crypto`, jamais de
 * bibliothèque ajoutée quand le standard de la plateforme suffit).
 *
 * Format standard respecté : `base64url(header).base64url(payload).base64url(signature)`,
 * où `signature = HMAC-SHA256(base64url(header) + "." + base64url(payload), secret)`.
 * Un JWT produit ici est un JWT HS256 valide, vérifiable par n'importe
 * quelle bibliothèque JWT standard côté client — aucun format
 * propriétaire inventé.
 */

export interface JwtPayload {
  /** Identifiant du sujet authentifié (ex. l'identifiant de l'installation ou de l'utilisateur). */
  sub: string;
  /** Rôle éventuel, transmis tel quel au gestionnaire de route (Partie 4 point 9). */
  role?: string;
  /** Horodatage d'expiration Unix (secondes) — absent = jamais expiré (à utiliser avec prudence). */
  exp?: number;
  /** Horodatage d'émission Unix (secondes). */
  iat?: number;
}

export type ResultatVerificationJwt = { valide: true; payload: JwtPayload } | { valide: false; raison: "format" | "signature" | "expire" | "payload" };

function base64UrlEncoder(donnees: Buffer | string): string {
  const tampon = typeof donnees === "string" ? Buffer.from(donnees, "utf-8") : donnees;
  return tampon.toString("base64url");
}

function base64UrlDecoder(valeur: string): Buffer {
  return Buffer.from(valeur, "base64url");
}

function calculerSignature(entete: string, payload: string, secret: string): string {
  return base64UrlEncoder(createHmac("sha256", secret).update(`${entete}.${payload}`).digest());
}

/**
 * Signe un JWT HS256. `expiresInSeconds` est optionnel — Partie 2 :
 * "expiration si prévue", jamais imposée arbitrairement ici, seulement
 * rendue possible pour l'appelant.
 */
export function signerJwt(payload: Omit<JwtPayload, "iat">, secret: string, expiresInSeconds?: number): string {
  const maintenant = Math.floor(Date.now() / 1000);
  const payloadComplet: JwtPayload = { ...payload, iat: maintenant, ...(expiresInSeconds !== undefined ? { exp: maintenant + expiresInSeconds } : {}) };
  const entete = base64UrlEncoder(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corps = base64UrlEncoder(JSON.stringify(payloadComplet));
  const signature = calculerSignature(entete, corps, secret);
  return `${entete}.${corps}.${signature}`;
}

/**
 * Vérifie RÉELLEMENT un JWT — jamais une simple présence (Partie 2 de la
 * correction : "un token existe donc l'utilisateur est autorisé n'est
 * PAS suffisant"). Vérifie dans l'ordre : le format (3 segments), la
 * signature (comparaison à temps constant — `timingSafeEqual`, jamais
 * `===` sur une valeur cryptographique, pour éviter une attaque par
 * mesure du temps de réponse), puis l'expiration si le champ `exp` est
 * présent dans le payload.
 */
export function verifierJwt(token: string, secret: string): ResultatVerificationJwt {
  const segments = token.split(".");
  if (segments.length !== 3) return { valide: false, raison: "format" };
  const [entete, corps, signatureRecue] = segments as [string, string, string];

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecoder(corps).toString("utf-8")) as JwtPayload;
  } catch {
    return { valide: false, raison: "payload" };
  }
  if (!payload || typeof payload.sub !== "string" || payload.sub.length === 0) {
    return { valide: false, raison: "payload" };
  }

  const signatureAttendue = calculerSignature(entete, corps, secret);
  const bufferRecue = base64UrlDecoder(signatureRecue);
  const bufferAttendue = base64UrlDecoder(signatureAttendue);
  // Les deux tampons doivent avoir la même longueur avant `timingSafeEqual`
  // (qui lève une exception sinon) — une longueur différente signifie déjà
  // une signature invalide, jamais une fuite d'information supplémentaire.
  if (bufferRecue.length !== bufferAttendue.length || !timingSafeEqual(bufferRecue, bufferAttendue)) {
    return { valide: false, raison: "signature" };
  }

  if (typeof payload.exp === "number" && Math.floor(Date.now() / 1000) >= payload.exp) {
    return { valide: false, raison: "expire" };
  }

  return { valide: true, payload };
}
