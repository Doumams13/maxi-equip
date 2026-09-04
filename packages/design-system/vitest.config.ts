import { defineConfig } from "vitest/config";

/**
 * Configuration Vitest propre à design-system : c'est le seul package du
 * monorepo dont les tests manipulent réellement le DOM (React Testing
 * Library, pour le système de notifications) — les autres packages
 * (domain, shared-types, api) restent en environnement Node par défaut,
 * plus rapide, puisqu'ils n'en ont pas besoin.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
