import { ipcMain, app } from "electron";
import type { UtilisateurRepository } from "../auth/utilisateurRepository.js";
import type { BackupRestoreService } from "../services/backupRestoreService.js";
import { estSetupRequis } from "./setup.js";
import {
  verifierEtRestaurerInstallation,
  type ResultatRecuperationInstallation,
  type EtapeProgressionRecuperation,
  type DetailProgressionTelechargement,
} from "../services/installationRecuperationService.js";

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
    async (event, motDePasse: string): Promise<ResultatRecuperationInstallation> => {
      if (!estSetupRequis(utilisateurRepository)) {
        return { success: false, message: "Cette installation est déjà configurée — la récupération n'est disponible qu'au premier lancement." };
      }
      // Nom de canal répété tel quel côté preload (voir
      // onInstallationRecuperationProgression) — même convention que le
      // reste de ce projet, aucune constante partagée entre les deux
      // fichiers pour les noms de canaux IPC.
      //
      // Throttle (2026-10-23) : un flux réseau rapide peut livrer des
      // centaines de morceaux par seconde — jamais autant de messages
      // IPC/re-rendus React pour une simple barre de progression. Le
      // prochain événement ("restauration") rattrape visuellement les
      // derniers pourcents ignorés ici, jamais un blocage silencieux.
      let dernierEnvoiMs = 0;
      const onProgress = (etape: EtapeProgressionRecuperation, detail?: DetailProgressionTelechargement): void => {
        if (event.sender.isDestroyed()) return;
        if (etape === "telechargement") {
          const maintenant = Date.now();
          if (maintenant - dernierEnvoiMs < 50) return;
          dernierEnvoiMs = maintenant;
        }
        event.sender.send("installation:recuperationProgression", etape, detail);
      };
      const resultat = await verifierEtRestaurerInstallation(motDePasse, restoreService, onProgress);
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
