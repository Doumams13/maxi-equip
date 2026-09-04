import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@maxi-equip/design-system";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) throw new Error("Élément #root introuvable");

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);
