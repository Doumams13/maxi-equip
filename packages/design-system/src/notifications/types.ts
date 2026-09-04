/**
 * Système de notifications (Toast) — composant réutilisable du Design
 * System MAXI EQUIP, destiné à toute l'application (écran de connexion
 * aujourd'hui, ventes/stock/facturation/etc. dans les phases suivantes).
 */

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastInput {
  type: ToastType;
  title: string;
  message: string;
  /** Durée d'affichage en ms avant disparition automatique. Si omis, utilise la durée par défaut du type (voir constants.ts). */
  durationMs?: number;
}

export interface ToastItem extends ToastInput {
  id: string;
}

export interface ToastContextValue {
  showToast: (input: ToastInput) => string;
  showSuccess: (title: string, message: string, durationMs?: number) => string;
  showError: (title: string, message: string, durationMs?: number) => string;
  showWarning: (title: string, message: string, durationMs?: number) => string;
  showInfo: (title: string, message: string, durationMs?: number) => string;
  dismissToast: (id: string) => void;
}
