import { ipcMain } from "electron";
import type { DemandeService } from "../services/demandeService.js";
import type { NotificationRepository } from "../repositories/notificationRepository.js";
import type { DemandeStatut } from "@maxi-equip/shared-types";
import type { SessionManager } from "../auth/sessionManager.js";

/**
 * Correction "Workflow réel des demandes" — Administrateur ET Gérant
 * peuvent tout faire ici, aucune restriction artificielle. Plus aucun
 * canal de modification des lignes/client ni de confirmation-vente :
 * ces actions vivent désormais réellement dans l'espace Vente
 * (`ventes:create`, déjà existant) — `demandes:marquer-traitee` ne fait
 * qu'enregistrer la liaison après coup, jamais une seconde création.
 *
 * CORRECTION SÉCURITÉ (audit "check up complet") : aucun canal ne
 * vérifiait la moindre session — atteignables via DevTools avant même
 * une connexion. La politique reste "aucune restriction de RÔLE" comme
 * ci-dessus, seule une session active est désormais exigée.
 */
export function registerDemandeIpcHandlers(
  demandeService: DemandeService,
  notificationRepository: NotificationRepository,
  sessionManager: SessionManager
): void {
  const estAuthentifie = () => sessionManager.isAuthenticated();
  // Les méthodes de service qui renvoient l'entité `Demande` directement
  // (jamais un wrapper `{success}`) lèvent déjà une exception métier en
  // cas d'état invalide (ex. "Demande introuvable") — l'IPC laisse cette
  // exception se propager telle quelle (comportement déjà établi pour ce
  // service), donc l'absence de session lève aussi une exception, jamais
  // un objet de forme différente qui romprait le contrat de retour.
  function exigerSession(): void {
    if (!estAuthentifie()) throw new Error("Non authentifié.");
  }

  ipcMain.handle("demandes:lister", () => (estAuthentifie() ? demandeService.listerToutes() : []));
  ipcMain.handle("demandes:obtenir", (_e, id: string) => (estAuthentifie() ? demandeService.obtenir(id) : null));
  ipcMain.handle("demandes:verifier-stock", (_e, id: string) => (estAuthentifie() ? demandeService.verifierStock(id) : []));
  ipcMain.handle("demandes:lister-suivi", (_e, id: string) => (estAuthentifie() ? demandeService.listerSuivi(id) : []));
  ipcMain.handle("demandes:compter-actives", () => (estAuthentifie() ? demandeService.compterActives() : 0));

  ipcMain.handle("demandes:marquer-suivi", (_e, id: string, statut: DemandeStatut, commentaire: string | null) => {
    exigerSession();
    return demandeService.marquerSuivi(id, statut, commentaire);
  });

  ipcMain.handle("demandes:marquer-traitee", (_e, id: string, factureId: string) => {
    exigerSession();
    return demandeService.marquerTraitee(id, factureId);
  });

  ipcMain.handle("demandes:refuser", (_e, id: string, motif: string) => {
    exigerSession();
    return demandeService.refuser(id, motif);
  });

  ipcMain.handle("demandes:annuler", (_e, id: string) => {
    exigerSession();
    return demandeService.annuler(id);
  });

  ipcMain.handle("notifications:lister", () => (estAuthentifie() ? notificationRepository.listerRecentes() : []));
  ipcMain.handle("notifications:compter-non-lues", () => (estAuthentifie() ? notificationRepository.compterNonLues() : 0));
  ipcMain.handle("notifications:marquer-lue", (_e, id: string) => {
    if (!estAuthentifie()) return;
    notificationRepository.marquerLue(id);
  });
  ipcMain.handle("notifications:marquer-toutes-lues", () => {
    if (!estAuthentifie()) return;
    notificationRepository.marquerToutesLues();
  });
}
