import type { MaxiEquipApi } from "../preload/index.js";

export {};

declare global {
  interface Window {
    maxiEquip: MaxiEquipApi;
  }
}
