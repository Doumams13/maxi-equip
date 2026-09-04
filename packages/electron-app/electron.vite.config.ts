import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Nos propres packages du monorepo (@maxi-equip/...) doivent être RÉELLEMENT
 * compilés dans le bundle du processus principal — jamais laissés en
 * dépendance externe. Leur "main" pointe vers du TypeScript source brut
 * (dossier src puis index.ts, décision Phase 0 : consommé directement par
 * les bundlers, cf. docs/architecture/PHASE0.md), qu'un simple require()
 * Node ne sait pas exécuter à l'exécution. Seules les vraies dépendances
 * npm tierces (electron, better-sqlite3-multiple-ciphers, hash-wasm...)
 * doivent rester externes — notamment le module natif SQLite, qui ne
 * peut de toute façon pas être empaqueté par Vite/Rollup.
 */
const EXCLUDE_FROM_EXTERNALIZATION = [
  "@maxi-equip/domain",
  "@maxi-equip/shared-types",
  "@maxi-equip/design-system",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: EXCLUDE_FROM_EXTERNALIZATION })],
    build: {
      outDir: "dist-main/main",
      rollupOptions: {
        output: { entryFileNames: "[name].cjs", format: "cjs" },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: EXCLUDE_FROM_EXTERNALIZATION })],
    build: {
      outDir: "dist-main/preload",
      rollupOptions: {
        output: { entryFileNames: "[name].cjs", format: "cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "dist-main/renderer",
    },
    plugins: [react()],
  },
});
