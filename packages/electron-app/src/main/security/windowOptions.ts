import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";

/**
 * Configuration de sécurité obligatoire de la fenêtre principale
 * (Synthèse §3, Corrections §1). Ces options ne sont PAS des valeurs par
 * défaut à ajuster au gré du développement — elles matérialisent la
 * séparation stricte entre le Renderer (interface, sans accès système) et
 * le Main Process (accès complet), posée dès l'étape 3 de l'architecture.
 *
 * - contextIsolation: true   → le Renderer ne partage aucun contexte JS
 *                              avec le monde Node/Electron.
 * - nodeIntegration: false   → aucune API Node.js accessible depuis le
 *                              code de l'interface.
 * - sandbox: true            → bac à sable du processus de rendu activé.
 * - webSecurity: true        → politiques de sécurité web standard actives
 *                              (CORS, contenu mixte, etc.)
 * - preload                  → SEUL pont autorisé, expose une API contrôlée
 *                              et nommée via contextBridge (voir src/preload).
 */
export function getSecureWebPreferences(
  preloadDir: string
): BrowserWindowConstructorOptions["webPreferences"] {
  return {
    preload: join(preloadDir, "index.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  };
}

/**
 * Politique de contenu (CSP) appliquée à toutes les pages chargées par
 * l'application — aucun contenu externe, uniquement le contenu local
 * empaqueté avec l'application (Synthèse §3).
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:;";
