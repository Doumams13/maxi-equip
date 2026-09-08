import type { MaxiEquipApi } from "../preload/index.js";

export {};

declare global {
  interface Window {
    maxiEquip: MaxiEquipApi;
  }
}

// Import Vite d'URL d'asset (utilisé pour le worker pdfjs-dist — voir
// components/PdfPreviewModal.tsx) : Vite gère nativement le suffixe
// "?url", mais aucune déclaration de type standard ne le couvre pour un
// fichier .mjs par défaut.
declare module "*.mjs?url" {
  const url: string;
  export default url;
}
