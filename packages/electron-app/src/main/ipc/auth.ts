import { ipcMain } from "electron";
import type { AuthService } from "../auth/authService.js";

/**
 * Points d'entrée IPC pour l'authentification — chaque canal est nommé et
 * explicite (jamais d'exposition générique d'ipcRenderer — §12 du prompt
 * Phase 1). Le mot de passe transite en clair uniquement le temps de cet
 * appel IPC interne (Renderer → Main, jamais stocké, jamais journalisé) ;
 * seul le résultat (succès/échec + session, sans aucun secret) revient
 * au Renderer.
 */
export function registerAuthIpcHandlers(authService: AuthService): void {
  ipcMain.handle("auth:login", async (_event, identifiant: string, motDePasse: string) => {
    const outcome = await authService.login(identifiant, motDePasse);
    // Le mot de passe reçu en paramètre n'est jamais renvoyé, ni journalisé
    // ici — uniquement transmis à authService.login(), qui le transmet au
    // hasher pour comparaison, sans jamais le persister nulle part.
    return outcome;
  });

  ipcMain.handle("auth:logout", () => {
    authService.logout();
    return { ok: true };
  });

  ipcMain.handle("auth:getSession", () => {
    return authService.getSession();
  });

  ipcMain.handle("auth:getPermissions", () => {
    return authService.getPermissions();
  });

  /**
   * Double validation par mot de passe — Paramètres (données sensibles).
   * Réutilise exactement la même vérification que la connexion, sans
   * jamais modifier la session en cours (voir authService.
   * verifierMotDePasseActuel). Le mot de passe transite en clair
   * uniquement le temps de cet appel, jamais journalisé ni stocké.
   */
  ipcMain.handle("auth:verifierMotDePasse", async (_event, motDePasse: string) => {
    const valide = await authService.verifierMotDePasseActuel(motDePasse);
    return { valide };
  });
}
