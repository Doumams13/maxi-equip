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
 *
 * "wasm-unsafe-eval" (et non "unsafe-eval", plus permissif) est
 * nécessaire pour pdfjs-dist (aperçu intégré des factures/documents
 * internes, correction "Voir/Imprimer/Télécharger") : la bibliothèque
 * exécute du WebAssembly pour certains traitements internes (décodage
 * JPX/JBIG2, polices) — sans cette autorisation, le rendu échouait
 * silencieusement (canvas blanc, sans message d'erreur avant ce
 * correctif). Cette directive n'autorise QUE l'instanciation WASM, pas
 * eval()/new Function() sur du texte arbitraire — la restriction reste
 * bien plus stricte qu'un "unsafe-eval" général.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:;";
