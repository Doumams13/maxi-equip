import { ipcMain, app } from "electron";
import type { UtilisateurRepository } from "../auth/utilisateurRepository.js";
import type { BackupRestoreService } from "../services/backupRestoreService.js";
import { estSetupRequis } from "./setup.js";
import { verifierEtRestaurerInstallation, type ResultatRecuperationInstallation } from "../services/installationRecuperationService.js";

/**
 * Canal IPC pour la récupération d'installation après vol/panne du PC
 * Shop — voir installationRecuperationService.ts pour l'orchestration
 * complète.
 *
 * GARDE CRITIQUE, différente de `backup:restore-*`
 * (ipc/backupRestore.ts, qui exige une session Administrateur déjà
 * ouverte) : ici, c'est justement le mécanisme qui EN TIENT LIEU pour
 * une installation fraîche où AUCUN compte local n'existe encore. Le
 * seul garde-fou possible est donc `estSetupRequis()` (aucun utilisateur
 * local) — jamais autorisé sur une installation déjà configurée, pour ne
 * jamais permettre d'écraser une base locale existante avec le mot de
 * passe de quelqu'un d'autre par ce canal.
 */
export function registerInstallationRecuperationIpcHandlers(
  utilisateurRepository: UtilisateurRepository,
  restoreService: BackupRestoreService
): void {
  ipcMain.handle(
    "installation:verifierEtRestaurer",
    async (_event, motDePasse: string): Promise<ResultatRecuperationInstallation> => {
      if (!estSetupRequis(utilisateurRepository)) {
        return { success: false, message: "Cette installation est déjà configurée — la récupération n'est disponible qu'au premier lancement." };
      }
      const resultat = await verifierEtRestaurerInstallation(motDePasse, restoreService);
      // Même principe que "backup:restore-executer" (ipc/backupRestore.ts) :
      // la base live a changé de fichier/clé, un relance propre est
      // nécessaire — jamais après un échec, où l'app doit continuer.
      if (resultat.success) {
        app.relaunch();
        app.exit(0);
      }
      return resultat;
    }
  );
}
