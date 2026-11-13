import { ipcMain } from "electron";
import { DevisRepository, type NouveauDevis } from "../repositories/devisRepository.js";
import type { SessionManager } from "../auth/sessionManager.js";

/**
 * Devis pro-forma (correction "ajouter les devis pro-forma", 2026-11-13)
 * — même politique d'accès que les demandes (ipc/demandes.ts) : aucune
 * restriction de RÔLE, une session active suffit (Administrateur ET
 * Gérant/Vendeur peuvent créer/consulter/convertir un devis).
 */
export function registerDevisIpcHandlers(devisRepository: DevisRepository, sessionManager: SessionManager): void {
  const estAuthentifie = () => sessionManager.isAuthenticated();
  function exigerSession(): void {
    if (!estAuthentifie()) throw new Error("Non authentifié.");
  }

  ipcMain.handle("devis:lister", () => (estAuthentifie() ? devisRepository.listerToutes() : []));
  ipcMain.handle("devis:obtenir", (_e, id: string) => (estAuthentifie() ? devisRepository.findById(id) : null));

  ipcMain.handle("devis:creer", (_e, input: NouveauDevis) => {
    exigerSession();
    const session = sessionManager.get();
    return devisRepository.creer({ ...input, utilisateurId: session?.userId ?? null });
  });

  /**
   * Conversion directe (décision utilisateur) : cette route n'applique
   * JAMAIS elle-même le stock/la numérotation — elle ne fait qu'enregistrer
   * la liaison APRÈS que VentesScreen (préremplie depuis ce devis, même
   * mécanisme que pour une demande) a créé une facture réelle via le
   * circuit normal (`ventes:create`). Un devis déjà converti ou annulé ne
   * peut jamais être reconverti.
   */
  ipcMain.handle("devis:marquer-convertie", (_e, id: string, factureId: string) => {
    exigerSession();
    const devis = devisRepository.findById(id);
    if (!devis) throw new Error("Devis introuvable.");
    if (devis.statut !== "brouillon") throw new Error("Ce devis a déjà été converti ou annulé.");
    devisRepository.marquerConvertie(id, factureId);
    return devisRepository.findById(id);
  });

  ipcMain.handle("devis:annuler", (_e, id: string) => {
    exigerSession();
    const devis = devisRepository.findById(id);
    if (!devis) throw new Error("Devis introuvable.");
    if (devis.statut !== "brouillon") throw new Error("Ce devis a déjà été converti ou annulé.");
    devisRepository.annuler(id);
    return devisRepository.findById(id);
  });
}
