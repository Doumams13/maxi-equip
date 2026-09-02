import { contextBridge, ipcRenderer } from "electron";

/**
 * API exposée au Renderer — volontairement minimale et nommée
 * explicitement (Synthèse §3). Le Renderer ne reçoit jamais `ipcRenderer`
 * lui-même, seulement ces fonctions précises. Aucun accès générique au
 * système de fichiers, à la base de données ou au réseau n'est exposé ici.
 */
const maxiEquipApi = {
  ping: (): Promise<{ ok: boolean; message: string; timestamp: string }> => ipcRenderer.invoke("app:ping"),
  dbHealthCheck: (): Promise<{ tableCount: number; tables: string[] }> =>
    ipcRenderer.invoke("app:dbHealthCheck"),
};

export type MaxiEquipApi = typeof maxiEquipApi;

contextBridge.exposeInMainWorld("maxiEquip", maxiEquipApi);
