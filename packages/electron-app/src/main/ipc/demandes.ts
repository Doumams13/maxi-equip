import { ipcMain } from "electron";
import type { DemandeService } from "../services/demandeService.js";
import type { NotificationRepository } from "../repositories/notificationRepository.js";
import type { DemandeStatut } from "@maxi-equip/shared-types";

/**
 * Correction "Workflow réel des demandes" — Administrateur ET Gérant
 * peuvent tout faire ici, aucune restriction artificielle. Plus aucun
 * canal de modification des lignes/client ni de confirmation-vente :
 * ces actions vivent désormais réellement dans l'espace Vente
 * (`ventes:create`, déjà existant) — `demandes:marquer-traitee` ne fait
 * qu'enregistrer la liaison après coup, jamais une seconde création.
 */
export function registerDemandeIpcHandlers(demandeService: DemandeService, notificationRepository: NotificationRepository): void {
  ipcMain.handle("demandes:lister", () => demandeService.listerToutes());
  ipcMain.handle("demandes:obtenir", (_e, id: string) => demandeService.obtenir(id));
  ipcMain.handle("demandes:verifier-stock", (_e, id: string) => demandeService.verifierStock(id));
  ipcMain.handle("demandes:lister-suivi", (_e, id: string) => demandeService.listerSuivi(id));
  ipcMain.handle("demandes:compter-actives", () => demandeService.compterActives());

  ipcMain.handle("demandes:marquer-suivi", (_e, id: string, statut: DemandeStatut, commentaire: string | null) =>
    demandeService.marquerSuivi(id, statut, commentaire)
  );

  ipcMain.handle("demandes:marquer-traitee", (_e, id: string, factureId: string) => demandeService.marquerTraitee(id, factureId));

  ipcMain.handle("demandes:refuser", (_e, id: string, motif: string) => demandeService.refuser(id, motif));
  ipcMain.handle("demandes:annuler", (_e, id: string) => demandeService.annuler(id));

  ipcMain.handle("notifications:lister", () => notificationRepository.listerRecentes());
  ipcMain.handle("notifications:compter-non-lues", () => notificationRepository.compterNonLues());
  ipcMain.handle("notifications:marquer-lue", (_e, id: string) => notificationRepository.marquerLue(id));
  ipcMain.handle("notifications:marquer-toutes-lues", () => notificationRepository.marquerToutesLues());
}
