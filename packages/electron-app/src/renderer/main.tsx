import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@maxi-equip/design-system";
import { App } from "./App.js";
import { ErrorBoundary } from "./app/ErrorBoundary.js";

/**
 * Correction "écran blanc fréquent" (2026-10-10) — erreurs hors rendu
 * React (gestionnaire d'événement async, promesse non gérée) : ne font
 * jamais démonter l'arbre React (voir ErrorBoundary.tsx pour ce cas-là),
 * mais restent invisibles pour le client sans accès à ses DevTools —
 * journalisées ici au même endroit, best-effort.
 */
window.addEventListener("error", (event) => {
  try {
    window.maxiEquip.reportRendererError({ source: "window.error", message: event.message, stack: event.error?.stack });
  } catch {
    // Best-effort.
  }
});
window.addEventListener("unhandledrejection", (event) => {
  try {
    const raison = event.reason;
    window.maxiEquip.reportRendererError({
      source: "unhandledrejection",
      message: raison instanceof Error ? raison.message : String(raison),
      stack: raison instanceof Error ? raison.stack : undefined,
    });
  } catch {
    // Best-effort.
  }
});

const container = document.getElementById("root");
if (!container) throw new Error("Élément #root introuvable");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
