import { contextBridge, ipcRenderer } from "electron";
import type { auth } from "@maxi-equip/domain";

/**
 * API exposée au Renderer — volontairement minimale et nommée
 * explicitement (Synthèse §3). Le Renderer ne reçoit jamais `ipcRenderer`
 * lui-même, seulement ces fonctions précises. Aucun accès générique au
 * système de fichiers, à la base de données ou au réseau n'est exposé ici.
 *
 * Authentification (Phase 1) : le mot de passe transite en clair
 * uniquement le temps de l'appel `login()` — jamais stocké côté Renderer,
 * jamais renvoyé par aucune des fonctions ci-dessous. Seules des
 * informations non sensibles (session, permissions) reviennent du Main
 * process.
 */
type LoginOutcome =
  | { success: true; session: auth.SessionLocale }
  | { success: false; reason: auth.AuthenticationFailureReason };

const maxiEquipApi = {
  ping: (): Promise<{ ok: boolean; message: string; timestamp: string }> => ipcRenderer.invoke("app:ping"),
  dbHealthCheck: (): Promise<{ tableCount: number; tables: string[] }> =>
    ipcRenderer.invoke("app:dbHealthCheck"),
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),

  login: (identifiant: string, motDePasse: string): Promise<LoginOutcome> =>
    ipcRenderer.invoke("auth:login", identifiant, motDePasse),
  logout: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("auth:logout"),
  getSession: (): Promise<auth.SessionLocale | null> => ipcRenderer.invoke("auth:getSession"),
  getPermissions: (): Promise<auth.PermissionSet | null> => ipcRenderer.invoke("auth:getPermissions"),

  lockWindowForLogin: (): Promise<void> => ipcRenderer.invoke("window:lockForLogin"),
  unlockWindowForApp: (): Promise<void> => ipcRenderer.invoke("window:unlockForApp"),
};

export type MaxiEquipApi = typeof maxiEquipApi;

contextBridge.exposeInMainWorld("maxiEquip", maxiEquipApi);
