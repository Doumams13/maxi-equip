import type { SessionManager } from "./sessionManager.js";

/**
 * Garde d'autorisation partagée — même logique que celle déjà utilisée
 * dans `ipc/utilisateurs.ts` (dupliquée là historiquement), extraite ici
 * pour être réutilisée par `ipc/backup.ts`/`ipc/backupRestore.ts`
 * (correction sécurité, audit "check up complet" : ces deux fichiers
 * n'avaient AUCUNE vérification de session/rôle côté Main, uniquement
 * un masquage de l'écran côté Renderer) sans tripler la même logique
 * inline, et pour rester testable directement (ce projet ne mocke
 * jamais `electron`/`ipcMain` dans ses tests).
 */
export function checkAdminGuard(sessionManager: SessionManager): { ok: true } | { ok: false; message: string } {
  const session = sessionManager.get();
  if (!session) return { ok: false, message: "Non authentifié." };
  if (session.role !== "administrateur") return { ok: false, message: "Action réservée aux administrateurs." };
  return { ok: true };
}
