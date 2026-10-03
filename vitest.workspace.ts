import { defineWorkspace } from "vitest/config";

/**
 * Déclare explicitement chaque package testable. Évite qu'un test ajouté
 * dans un package oublié de la liste ne soit silencieusement ignoré par
 * `npm test` à la racine.
 */
export default defineWorkspace([
  "packages/shared-types",
  "packages/domain",
  "packages/design-system",
  "packages/api",
  "packages/electron-app",
  // Correction "Intégration Site Phase 5" : `packages/site` avait ses
  // propres tests (vitest.config.ts) depuis la Phase 5 initiale, mais
  // n'était jamais inclus dans ce workspace — `npm run check:all` ne les
  // exécutait donc jamais réellement, contrairement à ce que son
  // objectif affiché (§ ci-dessus) promet. Corrigé ici : additif, ne
  // change le comportement d'aucun test existant.
  "packages/site",
]);
