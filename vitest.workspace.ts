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
]);
