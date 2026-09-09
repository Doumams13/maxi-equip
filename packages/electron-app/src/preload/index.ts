import { contextBridge, ipcRenderer } from "electron";
import type { auth } from "@maxi-equip/domain";
import type { Produit, Emplacement, Facture, Mouvement } from "@maxi-equip/shared-types";

/**
 * API exposée au Renderer — volontairement minimale et nommée
 * explicitement (Synthèse §3). Le Renderer ne reçoit jamais `ipcRenderer`
 * lui-même, seulement ces fonctions précises. Aucun accès générique au
 * système de fichiers, à la base de données ou au réseau n'est exposé ici.
 *
 * Authentification (Phase 1) : le mot de passe transite en clair
 * uniquement le temps de l'appel `login()` — jamais stocké côté Renderer,
 * jamais renvoyé par aucune des fonctions ci-dessous. Seules des
 * informations non sensibles (session, permissions) reviennent du Main
 * process.
 */
type LoginOutcome =
  | { success: true; session: auth.SessionLocale }
  | { success: false; reason: auth.AuthenticationFailureReason };

type StockErrorReason = "INSUFFICIENT_STOCK" | "INVALID_QUANTITY" | "VALIDATION_ERROR" | "UNKNOWN";
type StockOperationResult =
  | { success: true; [key: string]: unknown }
  | { success: false; reason: { code: StockErrorReason; message: string; available?: number; requested?: number } };

export interface AllocationDepot {
  emplacementId: string;
  quantite: number;
}
export interface VenteLigneInput {
  produitId: string;
  quantite: number;
  prixUnitaire: number;
  allocationsDepots: AllocationDepot[];
  fournisseurExterne?: string;
  prixAchatExterne?: number;
}
export interface VenteInput {
  pointDeVenteId: string;
  clientNom: string;
  clientTelephone: string;
  clientAdresse: string | null;
  vendeurUtilisateurId: string;
  vendeurCompteConnecteNom: string;
  vendeurNomManuel: string | null;
  modeReglement: string | null;
  lignes: VenteLigneInput[];
}

export interface ProduitAvecMiniature extends Produit {
  imagePrincipaleDataUrl: string | null;
  nombreImages: number;
  stockTotal: number;
}

export interface ImageAffichable {
  id: string;
  estPrincipale: boolean;
  ordre: number;
  dataUrl: string | null;
}

export interface StagedImage {
  stagingId: string;
  dataUrl: string;
}

export interface EvenementHistorique {
  id: string;
  type: "vente" | "annulation" | "entree" | "transfert";
  date: string;
  quantite: number | null;
  produitMotif: string | null;
  produitTaille: string | null;
  produitReference: string | null;
  emplacementNom: string | null;
  emplacementSourceNom: string | null;
  emplacementDestinationNom: string | null;
  factureId: string | null;
  factureNumero: string | null;
  clientNom: string | null;
  montant: number | null;
  motifAnnulation: string | null;
  utilisateurId: string | null;
  utilisateurNom: string | null;
  utilisateurRole: string | null;
}

const maxiEquipApi = {
  ping: (): Promise<{ ok: boolean; message: string; timestamp: string }> => ipcRenderer.invoke("app:ping"),
  dbHealthCheck: (): Promise<{ tableCount: number; tables: string[] }> =>
    ipcRenderer.invoke("app:dbHealthCheck"),
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),

  login: (identifiant: string, motDePasse: string): Promise<LoginOutcome> =>
    ipcRenderer.invoke("auth:login", identifiant, motDePasse),
  logout: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("auth:logout"),
  getSession: (): Promise<auth.SessionLocale | null> => ipcRenderer.invoke("auth:getSession"),
  getPermissions: (): Promise<auth.PermissionSet | null> => ipcRenderer.invoke("auth:getPermissions"),

  // --- Métier (Phase 2) ---
  listProduits: (): Promise<ProduitAvecMiniature[]> => ipcRenderer.invoke("catalogue:list"),
  getCatalogueSuggestions: (): Promise<{ types: string[]; tailles: string[] }> =>
    ipcRenderer.invoke("catalogue:suggestions"),
  createProduit: (input: {
    motif?: string;
    type: string;
    taille: string;
    largeur?: number;
    hauteur?: number;
    reference: string;
    prix: number;
    seuilAlerte: number;
  }): Promise<{ id: string }> => ipcRenderer.invoke("catalogue:create", input),
  updateProduit: (
    id: string,
    input: { type: string; taille: string; largeur?: number; hauteur?: number; reference: string; prix: number; seuilAlerte: number }
  ): Promise<{ success: boolean }> => ipcRenderer.invoke("catalogue:update", id, input),
  deleteProduit: (id: string, deletedBy: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("catalogue:delete", id, deletedBy),

  listEmplacements: (): Promise<Emplacement[]> => ipcRenderer.invoke("emplacements:list"),

  getStockByEmplacement: (emplacementId: string): Promise<{ produitId: string; quantite: number }[]> =>
    ipcRenderer.invoke("stock:byEmplacement", emplacementId),
  enregistrerEntree: (produitId: string, emplacementId: string, quantite: number): Promise<StockOperationResult> =>
    ipcRenderer.invoke("stock:entree", produitId, emplacementId, quantite),
  enregistrerTransfert: (
    produitId: string,
    sourceId: string,
    destinationId: string,
    quantite: number
  ): Promise<StockOperationResult> => ipcRenderer.invoke("stock:transfert", produitId, sourceId, destinationId, quantite),

  enregistrerVente: (input: VenteInput): Promise<StockOperationResult & { factureId?: string; numero?: string; total?: number }> =>
    ipcRenderer.invoke("ventes:create", input),

  listFactures: (): Promise<(Facture & { vendeurNom: string | null; vendeurRole: string | null })[]> => ipcRenderer.invoke("factures:list"),
  getResumeFacturesMois: (): Promise<{ nombre: number; total: number }> => ipcRenderer.invoke("factures:resumeMois"),
  genererFacturePdf: (factureId: string): Promise<{ success: boolean; chemin?: string; nomSuggere?: string; message?: string }> =>
    ipcRenderer.invoke("factures:genererPdf", factureId),
  genererDocumentInternePdf: (factureId: string): Promise<{ success: boolean; chemin?: string; nomSuggere?: string; message?: string }> =>
    ipcRenderer.invoke("factures:genererDocumentInternePdf", factureId),
  lireDocumentBase64: (chemin: string): Promise<{ success: boolean; base64?: string; message?: string }> =>
    ipcRenderer.invoke("documents:lireBase64", chemin),
  imprimerDocument: (chemin: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("documents:imprimer", chemin),
  telechargerDocument: (chemin: string, nomSuggere: string): Promise<{ success: boolean; canceled?: boolean; chemin?: string; message?: string }> =>
    ipcRenderer.invoke("documents:telecharger", chemin, nomSuggere),
  marquerFactureLivree: (factureId: string): Promise<{ success: boolean }> => ipcRenderer.invoke("factures:marquerLivree", factureId),
  annulerFacture: (factureId: string, motif: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("factures:annuler", factureId, motif),
  marquerFactureCorrigee: (factureOrigineId: string, nouvelleFactureId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("factures:marquerCorrigee", factureOrigineId, nouvelleFactureId),
  getDocumentInterneFacture: (
    factureId: string
  ): Promise<{ motif: string; taille: string; quantiteTotale: number; quantiteInterne: number; quantiteExterne: number; fournisseur: string | null; prixAchat: number | null }[]> =>
    ipcRenderer.invoke("factures:documentInterne", factureId),
  getNomMagasin: (): Promise<string> => ipcRenderer.invoke("parametres:getNomMagasin"),
  setNomMagasin: (nom: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("parametres:setNomMagasin", nom),
  getIdentiteEntreprise: (): Promise<{ nom: string; adresse: string; quartier: string; telephones: string[] }> =>
    ipcRenderer.invoke("parametres:getIdentite"),
  setIdentiteEntreprise: (identite: {
    nom: string;
    adresse: string;
    quartier: string;
    telephones: string[];
  }): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("parametres:setIdentite", identite),
  renommerEmplacement: (id: string, nouveauNom: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("emplacements:renommer", id, nouveauNom),
  getDonneesPourModification: (
    factureId: string
  ): Promise<{
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    modeReglement: string | null;
    lignes: {
      produitId: string | null;
      motif: string;
      taille: string;
      quantite: number;
      prixUnitaire: number;
      allocationsDepots: { emplacementId: string; quantite: number }[];
      fournisseurExterne: string | null;
      prixAchatExterne: number | null;
    }[];
  } | null> => ipcRenderer.invoke("factures:donneesPourModification", factureId),
  listHistorique: (): Promise<Mouvement[]> => ipcRenderer.invoke("historique:list"),
  listHistoriqueEnrichi: (): Promise<EvenementHistorique[]> => ipcRenderer.invoke("historique:listEnrichi"),
  listEntreesCompletes: (): Promise<EvenementHistorique[]> => ipcRenderer.invoke("stock:listEntrees"),
  listTransfertsComplets: (): Promise<EvenementHistorique[]> => ipcRenderer.invoke("stock:listTransferts"),

  getDashboardSummary: (): Promise<{
    stockTousDepots: number;
    caTotal: number;
    produitsSousSeuilGlobal: number;
    totalFactures: number;
    totalProduits: number;
    totalEntrees: number;
    totalSorties: number;
    promotionsActives: number;
    serieEntreesSorties: { jour: string; entrees: number; sorties: number }[];
    stockParEmplacement: { emplacementId: string; nom: string; cartons: number; referencesEnRupture: number }[];
    topProduitsVendus: { label: string; quantite: number }[];
    produitsSousSeuilListe: { id: string; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[];
    activiteRecente: EvenementHistorique[];
    stockDepots: number;
    stockParEmplacementPourGerant: { emplacementId: string; nom: string; cartons: number; referencesEnRupture: number }[];
    mesVentesAujourdhui: number;
    monChiffreAffaires: number;
    mesFacturesAujourdhuiCount: number;
    mesEntrees: number;
    mesSorties: number;
  } | null> => ipcRenderer.invoke("dashboard:summary"),

  // --- Images produit (correction Phase 2) ---
  // Le Renderer ne reçoit jamais de chemin de fichier — uniquement des
  // images déjà encodées (data URL), lues et converties côté Main (§12).
  listImages: (produitId: string): Promise<ImageAffichable[]> => ipcRenderer.invoke("images:list", produitId),
  pickAndAddImages: (produitId: string): Promise<{ success: boolean; added?: number; message?: string }> =>
    ipcRenderer.invoke("images:pickAndAdd", produitId),
  setImagePrincipale: (produitId: string, imageId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("images:setPrincipale", produitId, imageId),
  removeImage: (imageId: string): Promise<{ success: boolean }> => ipcRenderer.invoke("images:remove", imageId),

  // Mécanisme de "staging" — prévisualisation réelle avant même que le
  // produit n'existe (formulaire de création, correction 2 §7/§8).
  pickFilesToStaging: (): Promise<{ success: boolean; staged?: StagedImage[]; message?: string }> =>
    ipcRenderer.invoke("images:pickFilesToStaging"),
  commitStagedImages: (produitId: string, stagingIds: string[], principaleStagingId: string | null): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("images:commitStaged", produitId, stagingIds, principaleStagingId),
  discardStagedImages: (stagingIds: string[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("images:discardStaged", stagingIds),
};

export type MaxiEquipApi = typeof maxiEquipApi;

contextBridge.exposeInMainWorld("maxiEquip", maxiEquipApi);
