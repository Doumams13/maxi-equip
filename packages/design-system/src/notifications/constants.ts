import type { ToastType } from "./types.js";

/**
 * Durées d'affichage par défaut, centralisées ici — jamais écrites en dur
 * dans chaque écran appelant (§6 de la demande). Modifiable en un seul
 * endroit pour toute l'application.
 */
export const DEFAULT_TOAST_DURATIONS_MS: Record<ToastType, number> = {
  success: 4500,
  info: 4500,
  warning: 5500,
  error: 7000,
};
