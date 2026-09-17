import { ipcMain } from "electron";
import type { Role } from "@maxi-equip/shared-types";
import type { UtilisateurService } from "../services/utilisateurService.js";
import type { SessionManager } from "../auth/sessionManager.js";
import type { UtilisateurPublic } from "../auth/utilisateurRepository.js";

/**
 * Handlers IPC pour la gestion des utilisateurs.
 *
 * Chaque handler vérifie la session ET le rôle "administrateur" côté Main
 * — la protection ne repose JAMAIS uniquement sur l'interface (§13).
 * Les mots de passe ne sont JAMAIS inclus dans les données retournées ni
 * journalisés.
 *
 * Tous les handlers retournent `{ success: boolean; data?: T; message?: string }`.
 */
export function registerUtilisateursIpcHandlers(
  service: UtilisateurService,
  sessionManager: SessionManager
): void {
  /** Vérifie la session et que l'utilisateur courant est administrateur. */
  function checkAdmin(): { ok: true } | { ok: false; message: string } {
    const session = sessionManager.get();
    if (!session) {
      return { ok: false, message: "Non authentifié." };
    }
    if (session.role !== "administrateur") {
      return { ok: false, message: "Action réservée aux administrateurs." };
    }
    return { ok: true };
  }

  // --- Liste tous les utilisateurs ---
  ipcMain.handle(
    "utilisateurs:list",
    (): { success: boolean; data?: UtilisateurPublic[]; message?: string } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        const data = service.listerUtilisateurs();
        return { success: true, data };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- Créer un utilisateur ---
  ipcMain.handle(
    "utilisateurs:creer",
    async (
      _event,
      input: { nom: string; identifiant: string; role: Role; motDePasse: string; confirmation: string }
    ): Promise<{ success: boolean; id?: string; message?: string }> => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        const result = await service.creerUtilisateur(input);
        return { success: true, id: result.id };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- Modifier un utilisateur ---
  ipcMain.handle(
    "utilisateurs:modifier",
    (
      _event,
      id: string,
      input: { nom?: string; role?: Role; identifiant?: string }
    ): { success: boolean; message?: string } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        service.modifierUtilisateur(id, input);
        return { success: true };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- Réinitialiser le mot de passe ---
  ipcMain.handle(
    "utilisateurs:reinitialiserMotDePasse",
    async (
      _event,
      id: string,
      input: { motDePasse: string; confirmation: string }
    ): Promise<{ success: boolean; message?: string }> => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        await service.reinitialiserMotDePasse(id, input);
        return { success: true };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- Désactiver un utilisateur ---
  ipcMain.handle(
    "utilisateurs:desactiver",
    (
      _event,
      id: string
    ): { success: boolean; message?: string } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        service.desactiverUtilisateur(id);
        return { success: true };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- Activer un utilisateur ---
  ipcMain.handle(
    "utilisateurs:activer",
    (
      _event,
      id: string
    ): { success: boolean; message?: string } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        service.activerUtilisateur(id);
        return { success: true };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
