import { ipcMain } from "electron";
import type { DemandeService, ConfirmerDemandeInput } from "../services/demandeService.js";
import type { NotificationRepository } from "../repositories/notificationRepository.js";
import type { NouvelleLigneDemande } from "../repositories/demandeRepository.js";
import type { SessionManager } from "../auth/sessionManager.js";

/**
 * Phase 4.1, Partie 15 : Administrateur ET Gérant peuvent tout faire ici
 * — aucune restriction artificielle créée, cohérent avec la matrice de
 * droits officielle (l'écran Demandes n'est simplement jamais masqué au
 * Gérant côté Renderer). La traçabilité (Partie 16) est assurée en
 * transmettant systématiquement l'identité de la session réellement
 * connectée (`SessionManager`, déjà utilisé partout ailleurs), jamais
 * une saisie libre venant du Renderer.
 */
export function registerDemandeIpcHandlers(demandeService: DemandeService, notificationRepository: NotificationRepository, sessionManager: SessionManager): void {
  ipcMain.handle("demandes:lister", () => demandeService.listerToutes());
  ipcMain.handle("demandes:obtenir", (_e, id: string) => demandeService.obtenir(id));
  ipcMain.handle("demandes:verifier-stock", (_e, id: string) => demandeService.verifierStock(id));

  ipcMain.handle("demandes:modifier-lignes", (_e, id: string, lignes: NouvelleLigneDemande[]) => demandeService.modifierLignes(id, lignes));
  ipcMain.handle(
    "demandes:modifier-client",
    (
      _e,
      id: string,
      champs: { clientNom?: string; clientTelephone?: string; clientAdresse?: string; clientEmail?: string | null; commentaire?: string | null }
    ) => demandeService.modifierClient(id, champs)
  );

  ipcMain.handle("demandes:confirmer", (_e, id: string, input: Omit<ConfirmerDemandeInput, "vendeurUtilisateurId" | "vendeurCompteConnecteNom">) => {
    const session = sessionManager.get();
    if (!session) throw new Error("Aucune session active.");
    return demandeService.confirmer(id, { ...input, vendeurUtilisateurId: session.userId, vendeurCompteConnecteNom: session.nom });
  });

  ipcMain.handle("demandes:refuser", (_e, id: string, motif: string) => demandeService.refuser(id, motif));
  ipcMain.handle("demandes:annuler", (_e, id: string) => demandeService.annuler(id));

  ipcMain.handle("notifications:lister", () => notificationRepository.listerRecentes());
  ipcMain.handle("notifications:compter-non-lues", () => notificationRepository.compterNonLues());
  ipcMain.handle("notifications:marquer-lue", (_e, id: string) => notificationRepository.marquerLue(id));
  ipcMain.handle("notifications:marquer-toutes-lues", () => notificationRepository.marquerToutesLues());
}
