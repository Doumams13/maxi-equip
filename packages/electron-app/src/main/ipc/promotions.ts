import { ipcMain } from "electron";
import type { Promotion } from "@maxi-equip/shared-types";
import { PromotionService, PromotionConflitError } from "../services/promotionService.js";
import type { SessionManager } from "../auth/sessionManager.js";

/**
 * Handlers IPC pour la gestion des promotions.
 *
 * Toutes les opérations de mutation (créer, modifier, supprimer) sont
 * réservées aux Administrateurs — le Gérant peut uniquement consulter les
 * promotions actives (pour l'affichage des prix barrés dans l'écran Vente).
 * La vérification de rôle est faite côté Main à chaque appel, jamais
 * uniquement côté Renderer.
 */
export function registerPromotionsIpcHandlers(
  service: PromotionService,
  sessionManager: SessionManager
): void {
  function checkAdmin(): { ok: true } | { ok: false; message: string } {
    const session = sessionManager.get();
    if (!session) return { ok: false, message: "Non authentifié." };
    if (session.role !== "administrateur") return { ok: false, message: "Action réservée aux administrateurs." };
    return { ok: true };
  }

  function checkAuth(): { ok: true } | { ok: false; message: string } {
    const session = sessionManager.get();
    if (!session) return { ok: false, message: "Non authentifié." };
    return { ok: true };
  }

  ipcMain.handle("promotions:lister", (): { success: boolean; data?: Promotion[]; message?: string } => {
    const guard = checkAdmin();
    if (!guard.ok) return { success: false, message: guard.message };
    try {
      return { success: true, data: service.listerToutes() };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("promotions:actives", (): { success: boolean; data?: Promotion[]; message?: string } => {
    const guard = checkAuth();
    if (!guard.ok) return { success: false, message: guard.message };
    try {
      return { success: true, data: service.listerActives() };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("promotions:compterActives", (): number => {
    try {
      return service.compterActives();
    } catch {
      return 0;
    }
  });

  ipcMain.handle(
    "promotions:creer",
    (
      _event,
      input: Omit<Promotion, "id" | "createdAt" | "updatedAt">
    ): { success: boolean; data?: Promotion; message?: string; conflits?: Promotion[] } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        const promo = service.creer(input);
        return { success: true, data: promo };
      } catch (err) {
        if (err instanceof PromotionConflitError) {
          return { success: false, message: err.message, conflits: err.conflits };
        }
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    "promotions:modifier",
    (
      _event,
      id: string,
      input: Partial<Omit<Promotion, "id" | "createdAt" | "updatedAt">>
    ): { success: boolean; data?: Promotion; message?: string; conflits?: Promotion[] } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        const promo = service.modifier(id, input);
        return { success: true, data: promo };
      } catch (err) {
        if (err instanceof PromotionConflitError) {
          return { success: false, message: err.message, conflits: err.conflits };
        }
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    "promotions:supprimer",
    (_event, id: string): { success: boolean; message?: string } => {
      const guard = checkAdmin();
      if (!guard.ok) return { success: false, message: guard.message };
      try {
        service.supprimer(id);
        return { success: true };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
