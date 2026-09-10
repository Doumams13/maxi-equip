import { emettreJetonApplication } from "../core/emissionJetonApplication.js";
import { getJwtSecret } from "../core/config.js";

/**
 * Émission MINIMALE d'un JWT applicatif — correction "Phase 3.5.1 —
 * Consolidation API", Partie 5. Utilise `emettreJetonApplication()`
 * (voir `core/emissionJetonApplication.ts` pour le raisonnement complet
 * sur l'architecture d'émission, la distinction utilisateur/application,
 * et pourquoi aucune route HTTP publique n'est créée pour cela).
 *
 * DÉLIBÉRÉMENT PAS UNE ROUTE HTTP — un script exécuté HORS LIGNE, par un
 * opérateur ayant déjà accès à l'environnement serveur (donc déjà au
 * secret lui-même). Aucune exposition réseau nouvelle.
 *
 * Usage prévu (manuel, jamais automatisé pour l'instant) :
 *   npx tsx src/scripts/emettre-jwt-installation.ts [sub] [dureeJours]
 *
 * `sub` par défaut : "installation-locale" — cohérent avec la version
 * actuelle (une seule installation). Cette valeur deviendra un vrai
 * identifiant distinct par installation le jour où plusieurs
 * installations existeront — aucun changement de ce script nécessaire,
 * uniquement une valeur différente passée en argument.
 */
function main(): void {
  const sub = process.argv[2] ?? "installation-locale";
  const dureeJours = Number(process.argv[3] ?? "30");
  if (!Number.isFinite(dureeJours) || dureeJours <= 0) {
    // eslint-disable-next-line no-console
    console.error("Durée de validité invalide — indiquer un nombre de jours strictement positif.");
    process.exit(1);
  }

  const token = emettreJetonApplication(sub, getJwtSecret(), dureeJours * 24 * 60 * 60);

  // eslint-disable-next-line no-console
  console.log(token);
  // eslint-disable-next-line no-console
  console.error(`\nJeton émis pour "${sub}", valide ${dureeJours} jour(s). Ne jamais partager ce jeton par un canal non sécurisé.`);
}

main();
