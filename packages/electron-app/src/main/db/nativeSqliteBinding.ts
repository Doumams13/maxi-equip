import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Localise le binaire natif précompilé de `better-sqlite3-multiple-ciphers`
 * correspondant exactement à l'ABI en cours d'exécution (toujours Electron
 * en production — jamais Vitest, qui n'ouvre jamais de vraie base).
 *
 * Pourquoi cette fonction existe (bug réel reproduit et corrigé — Phase
 * 6C, test d'installation indépendant) : `better-sqlite3-multiple-ciphers`
 * (via `prebuild-install`) maintient deux emplacements distincts pour son
 * binaire natif — `build/Release/` (utilisé par la résolution générique
 * `bindings()`, appelée automatiquement par le module quand AUCUN binaire
 * n'est précisé explicitement) et `bin/<plateforme>-<arch>-<ABI>/` (son
 * propre cache de binaires précompilés, un par ABI). Un rebuild ciblant
 * Electron (postinstall, ou celui d'electron-builder à l'empaquetage) ne
 * met à jour QUE ce second emplacement : `build/Release/` peut donc rester
 * bloqué sur l'ABI Node "brut" de la toute première installation, SANS
 * aucune erreur au chargement du module — seulement au moment d'ouvrir
 * réellement une base ("NODE_MODULE_VERSION mismatch"), et ce quel que
 * soit l'endroit du code qui construit `new Database(...)`.
 *
 * TOUS les appels de `new Database(...)` / `new DatabaseCtor(...)` dans ce
 * projet DOIVENT passer `{ nativeBinding: resolveNativeBindingPath() }`
 * (fusionné avec leurs éventuelles autres options) — jamais construire une
 * instance sans cette option, même pour un usage ponctuel (vérification,
 * copie temporaire, restauration...). Le binaire ciblé est déjà présent et
 * vérifié à l'empaquetage (`asarUnpack: ["**\/*.node"]`).
 */
export function resolveNativeBindingPath(): string | undefined {
  try {
    const moduleRoot = dirname(require.resolve("better-sqlite3-multiple-ciphers/package.json"));
    const abiDir = `${process.platform}-${process.arch}-${process.versions.modules}`;
    const candidat = join(moduleRoot, "bin", abiDir, "better-sqlite3-multiple-ciphers.node");
    return existsSync(candidat) ? candidat : undefined;
  } catch {
    return undefined;
  }
}
