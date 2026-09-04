import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Toast } from "./Toast.js";
import { DEFAULT_TOAST_DURATIONS_MS } from "./constants.js";
import type { ToastContextValue, ToastInput, ToastItem } from "./types.js";

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Accès au système de notifications depuis n'importe quel écran de
 * l'application (§12 : "le composant doit pouvoir être appelé depuis les
 * futurs écrans"). Lève une erreur explicite si utilisé hors du
 * <ToastProvider> plutôt que d'échouer silencieusement.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() doit être utilisé à l'intérieur d'un <ToastProvider>.");
  }
  return ctx;
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `toast-${Date.now()}-${idCounter}`;
}

export interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Fournisseur unique du système de notifications — à placer une seule
 * fois, au sommet de l'application (voir main.tsx). Affiche les
 * notifications empilées en haut à droite de la fenêtre, sans jamais
 * déplacer le contenu principal (position fixe, superposée — §4).
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (input: ToastInput): string => {
      const id = generateId();
      const duration = input.durationMs ?? DEFAULT_TOAST_DURATIONS_MS[input.type];
      setToasts((prev) => [...prev, { ...input, id }]);

      const timer = setTimeout(() => dismissToast(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismissToast]
  );

  const showSuccess = useCallback(
    (title: string, message: string, durationMs?: number) => showToast({ type: "success", title, message, durationMs }),
    [showToast]
  );
  const showError = useCallback(
    (title: string, message: string, durationMs?: number) => showToast({ type: "error", title, message, durationMs }),
    [showToast]
  );
  const showWarning = useCallback(
    (title: string, message: string, durationMs?: number) => showToast({ type: "warning", title, message, durationMs }),
    [showToast]
  );
  const showInfo = useCallback(
    (title: string, message: string, durationMs?: number) => showToast({ type: "info", title, message, durationMs }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo, dismissToast }}>
      {children}
      <div
        aria-label="Notifications"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <Toast toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
