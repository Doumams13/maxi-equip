import { ipcMain } from "electron";
import type { IdentiteEntrepriseSnapshot } from "@maxi-equip/shared-types";
import { DevisRepository, type NouveauDevis } from "../repositories/devisRepository.js";
import type { SessionManager } from "../auth/sessionManager.js";
import { genererDevisPdf } from "../services/devisDocumentService.js";

/**
 * Devis pro-forma (correction "ajouter les devis pro-forma", 2026-11-13)
 * — même politique d'accès que les demandes (ipc/demandes.ts) : aucune
 * restriction de RÔLE, une session active suffit (Administrateur ET
 * Gérant/Vendeur peuvent créer/consulter/convertir un devis).
 *
 * Étendu le 2026-11-24 (point 6) : modification d'un brouillon et PDF
 * "FACTURE PROFORMA" (voir services/devisDocumentService.ts).
 */
export function registerDevisIpcHandlers(
  devisRepository: DevisRepository,
  sessionManager: SessionManager,
  contexteDocument: { getIdentite: () => IdentiteEntrepriseSnapshot; nomUtilisateur: (id: string) => string | null }
): void {
  const estAuthentifie = () => sessionManager.isAuthenticated();
  function exigerSession(): void {
    if (!estAuthentifie()) throw new Error("Non authentifié.");
  }
  function exigerBrouillon(id: string) {
    const devis = devisRepository.findById(id);
    if (!devis) throw new Error("Devis introuvable.");
    if (devis.statut !== "brouillon") throw new Error("Ce devis a déjà été converti ou annulé.");
    return devis;
  }
  function validerSaisie(input: NouveauDevis): void {
    if (!Array.isArray(input.lignes) || input.lignes.length === 0) throw new Error("Ajoutez au moins un article.");
    for (const l of input.lignes) {
      if (!Number.isInteger(l.quantite) || l.quantite <= 0) throw new Error("Chaque quantité doit être un nombre entier positif.");
      if (!Number.isFinite(l.prixUnitaire) || l.prixUnitaire < 0) throw new Error("Prix unitaire invalide.");
    }
  }

  ipcMain.handle("devis:lister", () => (estAuthentifie() ? devisRepository.listerToutes() : []));
  ipcMain.handle("devis:obtenir", (_e, id: string) => (estAuthentifie() ? devisRepository.findById(id) : null));

  ipcMain.handle("devis:creer", (_e, input: NouveauDevis) => {
    exigerSession();
    validerSaisie(input);
    const session = sessionManager.get();
    return devisRepository.creer({ ...input, utilisateurId: session?.userId ?? null });
  });

  /** Modification réservée aux devis encore en brouillon (un devis converti ou annulé reste figé, trace conservée). */
  ipcMain.handle("devis:modifier", (_e, id: string, input: NouveauDevis) => {
    exigerSession();
    exigerBrouillon(id);
    validerSaisie(input);
    return devisRepository.modifier(id, input);
  });

  ipcMain.handle("devis:genererPdf", async (_e, id: string) => {
    if (!estAuthentifie()) return { success: false, message: "Non authentifié." };
    const devis = devisRepository.findById(id);
    if (!devis) return { success: false, message: "Devis introuvable." };
    try {
      const chemin = await genererDevisPdf({
        devis,
        identite: contexteDocument.getIdentite(),
        vendeurNomAffiche: devis.utilisateurId ? contexteDocument.nomUtilisateur(devis.utilisateurId) : null,
      });
      return { success: true, chemin, nomSuggere: `Proforma-${devis.numero}.pdf` };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[devis] génération PDF impossible :", err);
      return { success: false, message: "Impossible de générer le devis proforma." };
    }
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
    exigerBrouillon(id);
    devisRepository.marquerConvertie(id, factureId);
    return devisRepository.findById(id);
  });

  ipcMain.handle("devis:annuler", (_e, id: string) => {
    exigerSession();
    exigerBrouillon(id);
    devisRepository.annuler(id);
    return devisRepository.findById(id);
  });
}
