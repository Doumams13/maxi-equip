/**
 * CORS — Phase Finale, correction bloquante identifiée à l'audit :
 * aucune gestion CORS n'existait avant cette étape. Or `RequestForm.tsx`
 * (site) appelle `POST /v1/public/requests` DEPUIS LE NAVIGATEUR (client
 * component), et le catalogue interroge `GET /v1/public/images` pour les
 * balises `<img>` — deux appels cross-origin dès que le site et l'API
 * sont sur des domaines/ports différents (déjà vrai en développement
 * local : site sur :3000, API sur :8787 ; obligatoire en production,
 * §14 : maxi-equip.com / api.maxi-equip.com). Sans en-têtes CORS, le
 * navigateur bloque purement et simplement ces requêtes — jamais une
 * question de configuration optionnelle.
 *
 * CONFIGURATION : `CORS_ALLOWED_ORIGINS`, liste d'origines séparées par
 * des virgules (ex. "https://maxi-equip.com,https://www.maxi-equip.com").
 * Jamais de wildcard "*" — l'origine de la requête est reflétée
 * uniquement si elle figure dans la liste autorisée (pratique standard,
 * nécessaire ici car `POST /v1/public/requests` est une requête réelle,
 * pas seulement de la lecture).
 *
 * Développement : si la variable n'est pas définie et que
 * MAXI_EQUIP_ENV n'est pas "production", TOUTE origine est acceptée
 * (même principe de secours que `getJwtSecret`/`getPublicApiBaseUrl` —
 * ne jamais bloquer le développement local faute de configuration).
 * Production : si la variable n'est pas définie, AUCUNE origine n'est
 * autorisée (échec fermé — jamais un wildcard implicite en production).
 */

const EN_TETES_AUTORISES = "Content-Type, Authorization";
const METHODES_AUTORISEES = "GET, POST, PATCH, DELETE, OPTIONS";

function originesConfigurees(): string[] | null {
  const valeur = process.env["CORS_ALLOWED_ORIGINS"];
  if (!valeur || !valeur.trim()) return null;
  return valeur
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Résout l'origine à refléter dans `Access-Control-Allow-Origin`, ou `null` si elle ne doit pas être autorisée. */
export function resoudreOrigineAutorisee(origineRequete: string | undefined): string | null {
  if (!origineRequete) return null;
  const origines = originesConfigurees();

  if (origines === null) {
    const environnement = process.env["MAXI_EQUIP_ENV"] ?? "development";
    // Jamais de secours permissif en production — échec fermé si CORS_ALLOWED_ORIGINS n'est pas configurée.
    return environnement === "production" ? null : origineRequete;
  }

  return origines.includes(origineRequete) ? origineRequete : null;
}

/** En-têtes CORS à ajouter à TOUTE réponse (y compris les erreurs) si l'origine est autorisée. */
export function enTetesCors(origineRequete: string | undefined): Record<string, string> {
  const origine = resoudreOrigineAutorisee(origineRequete);
  if (!origine) return {};
  return {
    "Access-Control-Allow-Origin": origine,
    Vary: "Origin",
  };
}

/** En-têtes de réponse à une requête préliminaire OPTIONS (préflight). */
export function enTetesPreflight(origineRequete: string | undefined): Record<string, string> {
  const base = enTetesCors(origineRequete);
  if (Object.keys(base).length === 0) return {};
  return {
    ...base,
    "Access-Control-Allow-Methods": METHODES_AUTORISEES,
    "Access-Control-Allow-Headers": EN_TETES_AUTORISES,
    "Access-Control-Max-Age": "86400",
  };
}
