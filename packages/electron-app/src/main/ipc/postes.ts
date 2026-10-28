import { ipcMain } from "electron";
import type { PosteSyncService, ResultatAction, ResultatLectureMoi, ResultatLectureListe } from "../services/posteSyncService.js";
import type { SessionManager } from "../auth/sessionManager.js";
import { checkAdminGuard } from "../auth/checkAdminGuard.js";

/**
 * Identité et registre des postes — système multiposte fiable
 * (2026-10-28). `postes:obtenir-moi` est accessible à toute session
 * authentifiée (nécessaire pour la modale "nommer ce poste" affichée
 * juste après une restauration, avant qu'un rôle Administrateur ne
 * soit forcément déjà établi) — toutes les autres actions (lister,
 * bloquer, réautoriser, retirer, rejoindre le registre) sont réservées
 * à l'Administrateur, même garde que `ipc/utilisateurs.ts`.
 */
export function registerPostesIpcHandlers(posteSyncService: PosteSyncService, sessionManager: SessionManager): void {
  const estAuthentifie = () => sessionManager.isAuthenticated();
  const checkAdmin = () => checkAdminGuard(sessionManager);

  ipcMain.handle("postes:obtenir-moi", async (): Promise<ResultatLectureMoi> => {
    if (!estAuthentifie()) return { success: false, message: "Non authentifié." };
    return posteSyncService.obtenirMoi();
  });

  ipcMain.handle("postes:definir-nom", async (_e, nom: string): Promise<ResultatAction> => {
    if (!estAuthentifie()) return { success: false, message: "Non authentifié." };
    return posteSyncService.definirNom(nom);
  });

  ipcMain.handle("postes:lister", async (): Promise<ResultatLectureListe> => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };
    return posteSyncService.lister();
  });

  ipcMain.handle("postes:bloquer", async (_e, posteId: string): Promise<ResultatAction> => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };
    return posteSyncService.bloquer(posteId);
  });

  ipcMain.handle("postes:reautoriser", async (_e, posteId: string): Promise<ResultatAction> => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };
    return posteSyncService.reautoriser(posteId);
  });

  ipcMain.handle("postes:retirer", async (_e, posteId: string): Promise<ResultatAction> => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };
    return posteSyncService.retirer(posteId);
  });

  ipcMain.handle("postes:rejoindre-registre", async (): Promise<ResultatAction> => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };
    return posteSyncService.rejoindreRegistre();
  });
}
