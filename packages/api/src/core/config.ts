/**
 * Configuration du secret de signature JWT — correction "Phase 3.5 —
 * Sécurisation de l'API", Partie 3.
 *
 * RÈGLE ABSOLUE : jamais de secret codé en dur, jamais exposé au
 * client, jamais commité. Toujours lu depuis `JWT_SIGNING_SECRET`
 * (variable d'environnement, déjà documentée dans `.env.example`
 * depuis la Phase 0, jamais renseignée jusqu'ici).
 *
 * Développement/test : une valeur par défaut STABLE est utilisée si la
 * variable n'est pas définie — permet aux tests automatisés et au
 * développement local de fonctionner sans configuration manuelle,
 * jamais un obstacle inutile (Partie 3 : "ne pas casser les tests
 * existants"). Cette valeur n'a aucune valeur de sécurité réelle et
 * n'est JAMAIS utilisée si `MAXI_EQUIP_ENV=production`.
 *
 * Production : la variable DOIT être définie explicitement — l'API
 * refuse de démarrer/signer/vérifier un jeton plutôt que d'utiliser une
 * valeur par défaut connue publiquement (le code de ce projet est lisible
 * par quiconque a accès au dépôt).
 */

const SECRET_DEV_PAR_DEFAUT = "dev-only-insecure-secret-never-use-in-production";

export class ConfigurationSecuriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationSecuriteError";
  }
}

export function getJwtSecret(): string {
  const environnement = process.env["MAXI_EQUIP_ENV"] ?? "development";
  const secretConfigure = process.env["JWT_SIGNING_SECRET"];

  if (secretConfigure && secretConfigure.trim().length > 0) {
    return secretConfigure;
  }

  if (environnement === "production") {
    throw new ConfigurationSecuriteError(
      "JWT_SIGNING_SECRET doit être défini explicitement en production. Aucune valeur par défaut n'est utilisée pour cet environnement — voir .env.example."
    );
  }

  // Développement et test uniquement.
  return SECRET_DEV_PAR_DEFAUT;
}
