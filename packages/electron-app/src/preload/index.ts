import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
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
  | {
      success: false;
      // Correction "travail à distance / plusieurs machines en parallèle"
      // (2026-10-22) — "CONNEXION_REQUISE"/"TROP_DE_TENTATIVES" viennent
      // de la connexion en ligne (voir authService.ts), absents du
      // domaine (qui ignore tout du réseau).
      reason: auth.AuthenticationFailureReason | "CONNEXION_REQUISE" | "TROP_DE_TENTATIVES";
      message?: string;
    };

/**
 * Vue publique d'un utilisateur — définie localement pour éviter tout
 * import cross-package dans le preload (contrainte sandbox/contextBridge).
 * Doit rester synchronisée avec UtilisateurPublic de utilisateurRepository.
 */
interface UtilisateurPublic {
  id: string;
  nom: string;
  identifiant: string;
  role: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

type StockErrorReason = "INSUFFICIENT_STOCK" | "INVALID_QUANTITY" | "VALIDATION_ERROR" | "CONNEXION_REQUISE" | "UNKNOWN";
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
  /** Correction "Rendre le numéro de téléphone facultatif" (2026-10-21) — `null` = non renseigné. */
  clientTelephone: string | null;
  clientAdresse: string | null;
  vendeurUtilisateurId: string;
  vendeurCompteConnecteNom: string;
  vendeurNomManuel: string | null;
  modeReglement: string | null;
  lignes: VenteLigneInput[];
  remise: number;
  /** Omis = vente classique intégralement payée. Voir VenteService.VenteInput. */
  statutPaiement?: "reservation" | "payee";
  /** Pertinent uniquement si statutPaiement === "reservation" (l'acompte). */
  montantPaye?: number;
}

export interface ProduitAvecMiniature extends Produit {
  imagePrincipaleDataUrl: string | null;
  nombreImages: number;
  stockTotal: number;
}

export interface VarianteProduit {
  id: string;
  modeleId: string | null;
  taille: string;
  tailleTri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  prix: number;
  carreauxParCarton: number | null;
  seuilAlerte: number;
  deletedAt: string | null;
  stockTotal: number;
}

export interface ModeleProduitAvecVariantes {
  id: string;
  motif: string;
  type: string;
  ordreVitrine: number | null;
  deletedAt: string | null;
  imagePrincipaleDataUrl: string | null;
  nombreImages: number;
  variantes: VarianteProduit[];
}

export interface VarianteInput {
  taille: string;
  tailleTri?: number;
  largeur?: number | null;
  hauteur?: number | null;
  reference: string;
  prix: number;
  carreauxParCarton?: number | null;
  seuilAlerte?: number;
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
  type: "vente" | "annulation" | "entree" | "sortie" | "transfert";
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
  /** Renseigné UNIQUEMENT pour une entrée/sortie manuelle annulée — toujours null pour vente/annulation/transfert. */
  annuleLe: string | null;
}

const maxiEquipApi = {
  ping: (): Promise<{ ok: boolean; message: string; timestamp: string }> => ipcRenderer.invoke("app:ping"),
  dbHealthCheck: (): Promise<{ tableCount: number; tables: string[] }> =>
    ipcRenderer.invoke("app:dbHealthCheck"),
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
  /**
   * Correction "écran blanc fréquent" (2026-10-10) — fire-and-forget,
   * jamais de réponse attendue (voir ipc/index.ts).
   */
  reportRendererError: (payload: { source: string; message: string; stack?: string }): void =>
    ipcRenderer.send("app:reportRendererError", payload),

  // --- Configuration initiale (Phase 6C) — remplace le mot de passe
  // Administrateur généré aléatoirement. Le mot de passe choisi transite
  // en clair uniquement le temps de cet appel IPC, jamais stocké ni
  // journalisé côté Renderer — même principe que login(). ---
  setupEstRequis: (): Promise<boolean> => ipcRenderer.invoke("setup:estRequis"),
  setupCreerAdmin: (input: {
    nom: string;
    identifiant: string;
    motDePasse: string;
    confirmation: string;
  }): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("setup:creerAdmin", input),

  // --- Récupération d'installation (PC Shop volé/remplacé) — le mot de
  // passe transite en clair uniquement le temps de cet appel IPC, jamais
  // stocké ni journalisé côté Renderer, même principe que login(). ---
  installationVerifierEtRestaurer: (
    motDePasse: string
  ): Promise<{ success: boolean; etape?: string; message?: string }> =>
    ipcRenderer.invoke("installation:verifierEtRestaurer", motDePasse),
  /**
   * Progression de `installationVerifierEtRestaurer` (2026-10-22, retour
   * utilisateur : "on ne voit rien pendant le téléchargement") — canal
   * PUSH (main → Renderer), contrairement au reste de ce fichier
   * (toujours request/response). S'abonne juste avant l'appel ci-dessus,
   * se désabonne dans le `finally` de l'appelant — retourne la fonction
   * de désabonnement, jamais un abonnement permanent oublié.
   */
  onInstallationRecuperationProgression: (
    callback: (
      etape: "verification" | "telechargement" | "restauration" | "finalisation",
      detail?: { recuOctets: number; totalOctets: number | null }
    ) => void
  ): (() => void) => {
    const listener = (
      _event: IpcRendererEvent,
      etape: "verification" | "telechargement" | "restauration" | "finalisation",
      detail?: { recuOctets: number; totalOctets: number | null }
    ) => callback(etape, detail);
    ipcRenderer.on("installation:recuperationProgression", listener);
    return () => ipcRenderer.removeListener("installation:recuperationProgression", listener);
  },

  login: (identifiant: string, motDePasse: string): Promise<LoginOutcome> =>
    ipcRenderer.invoke("auth:login", identifiant, motDePasse),
  logout: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("auth:logout"),
  getSession: (): Promise<auth.SessionLocale | null> => ipcRenderer.invoke("auth:getSession"),
  getPermissions: (): Promise<auth.PermissionSet | null> => ipcRenderer.invoke("auth:getPermissions"),
  verifierMotDePasse: (motDePasse: string): Promise<{ valide: boolean }> => ipcRenderer.invoke("auth:verifierMotDePasse", motDePasse),

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
  enregistrerSortie: (produitId: string, emplacementId: string, quantite: number): Promise<StockOperationResult> =>
    ipcRenderer.invoke("stock:sortie", produitId, emplacementId, quantite),
  enregistrerTransfert: (
    produitId: string,
    sourceId: string,
    destinationId: string,
    quantite: number
  ): Promise<StockOperationResult> => ipcRenderer.invoke("stock:transfert", produitId, sourceId, destinationId, quantite),
  annulerMouvementStock: (mouvementId: string, motif: string): Promise<StockOperationResult> =>
    ipcRenderer.invoke("stock:annulerMouvement", mouvementId, motif),

  enregistrerVente: (input: VenteInput): Promise<StockOperationResult & { factureId?: string; numero?: string; total?: number }> =>
    ipcRenderer.invoke("ventes:create", input),

  listFacturesPagine: (filtres: {
    recherche: string;
    statutFiltre: "tous" | "annulee" | "en_attente" | "livree";
    vendeurUtilisateurId: string | null;
    colonneTri: "numero" | "date" | "client" | "vendeur" | "montant" | "statut" | null;
    direction: "asc" | "desc";
    page: number;
    tailleParPage: number;
  }): Promise<{
    resultats: (Facture & { vendeurNom: string | null; vendeurRole: string | null; aAchatExterieur: boolean })[];
    totalResultats: number;
    page: number;
    totalPages: number;
    tailleParPage: number;
  }> => ipcRenderer.invoke("factures:listPagine", filtres),
  listVendeursFiltrables: (): Promise<{ id: string; nom: string }[]> => ipcRenderer.invoke("factures:listVendeursFiltrables"),

  // --- Synchronisation (Phase 3.7) — le Renderer lance et reçoit un
  // résultat, jamais le JWT ni la logique PUSH/PULL (Partie 14). ---
  synchroniser: (): Promise<{
    success: boolean;
    push?: { envoyees: number; confirmees: number };
    pull?: { recues: number };
    etape?: "configuration" | "push" | "pull";
    message?: string;
  }> => ipcRenderer.invoke("sync:run"),
  syncEstEnCours: (): Promise<boolean> => ipcRenderer.invoke("sync:estEnCours"),
  syncEstConfiguree: (): Promise<boolean> => ipcRenderer.invoke("sync:configuree"),

  // --- Mise à jour automatique — interrogée par polling (même principe
  // que les notifications, jamais un canal d'événements poussés). ---
  miseAJourEtat: (): Promise<{
    disponible: boolean;
    telechargee: boolean;
    version: string | null;
    verificationEnCours: boolean;
    aJour: boolean;
    versionActuelle: string;
    progression: number | null;
  }> => ipcRenderer.invoke("update:etat"),
  miseAJourVerifierManuellement: (): Promise<void> => ipcRenderer.invoke("update:verifierManuellement"),
  miseAJourTelecharger: (): Promise<void> => ipcRenderer.invoke("update:telecharger"),
  miseAJourInstallerMaintenant: (): Promise<void> => ipcRenderer.invoke("update:installerMaintenant"),

  // --- Sauvegarde (Phase 3.8) — le Renderer ne choisit jamais un chemin
  // directement ni n'accède au système de fichiers : la boîte de
  // dialogue et toute l'écriture réelle restent côté Main. ---
  backupChoisirDossier: (): Promise<{ canceled: true } | { canceled: false; dossier: string }> => ipcRenderer.invoke("backup:choisir-dossier"),
  backupCreerManuelle: (dossier: string, motDePasse: string, confirmation: string): Promise<{ success: boolean; chemin?: string; message?: string }> =>
    ipcRenderer.invoke("backup:creer-manuelle", dossier, motDePasse, confirmation),
  backupGetStatut: (): Promise<{ derniereAutomatique: { createdAt: string } | null; nombreVulnerables: number }> => ipcRenderer.invoke("backup:get-status"),
  backupOuvrirDossier: (): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("backup:open-folder"),

  // --- Restauration (Phase 3.9) — le Renderer ne fait qu'orchestrer les
  // étapes visuelles ; toute la logique réelle (vérification, mot de
  // passe, safety backup, échange de fichiers, redémarrage) reste côté
  // Main. ---
  backupRestoreChoisirDossier: (): Promise<{ canceled: true } | { canceled: false; dossier: string }> =>
    ipcRenderer.invoke("backup:restore-choisir-dossier"),
  backupRestoreAnalyser: (
    dossier: string
  ): Promise<{
    compatible: "ok" | "avertissement" | "incompatible";
    message: string;
    type?: "manual" | "automatic" | "safety";
    necessiteMotDePasse: boolean;
    createdAt?: string;
    vulnerable: boolean;
  }> => ipcRenderer.invoke("backup:restore-analyser", dossier),
  backupRestoreExecuter: (dossier: string, motDePasse?: string): Promise<{ success: boolean; message?: string; etape?: string }> =>
    ipcRenderer.invoke("backup:restore-executer", dossier, motDePasse),

  // --- Demandes du site (Phase 4.1, corrigée) — Administrateur et Gérant.
  // Plus aucun canal de modification des lignes/client ni de
  // confirmation-vente : la demande alimente désormais l'espace Vente
  // réel (voir enregistrerVente + demandesMarquerTraitee), jamais une
  // seconde logique de vente ici. ---
  demandesLister: (): Promise<import("@maxi-equip/shared-types").Demande[]> => ipcRenderer.invoke("demandes:lister"),
  demandesObtenir: (id: string): Promise<import("@maxi-equip/shared-types").Demande | null> => ipcRenderer.invoke("demandes:obtenir", id),
  demandesVerifierStock: (
    id: string
  ): Promise<{ produitId: string; motif: string; taille: string; quantiteDemandee: number; quantiteDisponible: number }[]> =>
    ipcRenderer.invoke("demandes:verifier-stock", id),
  demandesListerSuivi: (
    id: string
  ): Promise<{ statut: import("@maxi-equip/shared-types").DemandeStatut; commentaire: string | null; createdAt: string }[]> =>
    ipcRenderer.invoke("demandes:lister-suivi", id),
  demandesCompterActives: (): Promise<number> => ipcRenderer.invoke("demandes:compter-actives"),
  demandesMarquerSuivi: (
    id: string,
    statut: "nouvelle" | "en_cours" | "a_contacter",
    commentaire: string | null
  ): Promise<import("@maxi-equip/shared-types").Demande> => ipcRenderer.invoke("demandes:marquer-suivi", id, statut, commentaire),
  /** Appelé UNIQUEMENT après le succès réel de `enregistrerVente()` — jamais un point de confirmation en soi. */
  demandesMarquerTraitee: (id: string, factureId: string): Promise<import("@maxi-equip/shared-types").Demande> =>
    ipcRenderer.invoke("demandes:marquer-traitee", id, factureId),
  demandesRefuser: (id: string, motif: string): Promise<import("@maxi-equip/shared-types").Demande> => ipcRenderer.invoke("demandes:refuser", id, motif),
  demandesAnnuler: (id: string): Promise<import("@maxi-equip/shared-types").Demande> => ipcRenderer.invoke("demandes:annuler", id),

  notificationsLister: (): Promise<import("@maxi-equip/shared-types").Notification[]> => ipcRenderer.invoke("notifications:lister"),
  notificationsCompterNonLues: (): Promise<number> => ipcRenderer.invoke("notifications:compter-non-lues"),
  notificationsMarquerLue: (id: string): Promise<void> => ipcRenderer.invoke("notifications:marquer-lue", id),
  notificationsMarquerToutesLues: (): Promise<void> => ipcRenderer.invoke("notifications:marquer-toutes-lues"),

  // --- Identité et registre des postes (2026-10-28) — voir ipc/postes.ts. ---
  posteObtenirMoi: (): Promise<import("../main/services/posteSyncService.js").ResultatLectureMoi> => ipcRenderer.invoke("postes:obtenir-moi"),
  posteDefinirNom: (nom: string): Promise<import("../main/services/posteSyncService.js").ResultatAction> =>
    ipcRenderer.invoke("postes:definir-nom", nom),
  posteLister: (): Promise<import("../main/services/posteSyncService.js").ResultatLectureListe> => ipcRenderer.invoke("postes:lister"),
  posteBloquer: (posteId: string): Promise<import("../main/services/posteSyncService.js").ResultatAction> =>
    ipcRenderer.invoke("postes:bloquer", posteId),
  posteReautoriser: (posteId: string): Promise<import("../main/services/posteSyncService.js").ResultatAction> =>
    ipcRenderer.invoke("postes:reautoriser", posteId),
  posteRetirer: (posteId: string): Promise<import("../main/services/posteSyncService.js").ResultatAction> =>
    ipcRenderer.invoke("postes:retirer", posteId),
  posteRejoindreRegistre: (): Promise<import("../main/services/posteSyncService.js").ResultatAction> =>
    ipcRenderer.invoke("postes:rejoindre-registre"),
  /**
   * Blocage à distance (2026-10-28) — canal PUSH (main → Renderer),
   * même convention que `onInstallationRecuperationProgression` :
   * déclenché par le cycle de synchro automatique (main/index.ts),
   * jamais par un appel du Renderer — ce poste peut être bloqué sans
   * qu'aucun écran n'ait rien demandé. Abonnement permanent (pas de
   * désabonnement systématique attendu, contrairement à la progression
   * de récupération, ponctuelle) — retourne néanmoins la fonction de
   * désabonnement, par cohérence.
   */
  onSessionRevoquee: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("session:revoquee", listener);
    return () => ipcRenderer.removeListener("session:revoquee", listener);
  },
  trouverPageFacture: (factureId: string, tailleParPage: number): Promise<number | null> => ipcRenderer.invoke("factures:trouverPage", factureId, tailleParPage),
  getResumeFacturesMois: (): Promise<{ nombre: number; total: number }> => ipcRenderer.invoke("factures:resumeMois"),
  genererFacturePdf: (factureId: string): Promise<{ success: boolean; chemin?: string; nomSuggere?: string; message?: string }> =>
    ipcRenderer.invoke("factures:genererPdf", factureId),
  genererDocumentInternePdf: (factureId: string): Promise<{ success: boolean; chemin?: string; nomSuggere?: string; message?: string }> =>
    ipcRenderer.invoke("factures:genererDocumentInternePdf", factureId),
  // --- Bilan d'activité (2026-10-21) — réservé à l'Administrateur, voir checkAdminGuard côté Main. ---
  genererBilan: (
    debut: string,
    fin: string
  ): Promise<
    | {
        success: true;
        ventes: { caTotal: number; nombreFactures: number; remiseTotale: number };
        topProduits: { label: string; quantite: number }[];
        mouvements: { totalEntrees: number; totalSorties: number };
        stockParEmplacement: { emplacementId: string; nom: string; cartons: number }[];
        produitsSousSeuilCount: number;
        promotionsActivesPendantPeriode: number;
        depots: { id: string; nom: string }[];
        detailProduits: {
          produitId: string;
          motif: string;
          taille: string;
          reference: string;
          stockParEmplacement: { emplacementId: string; cartons: number }[];
          vendu: number;
          sortie: number;
        }[];
      }
    | { success: false; message: string }
  > => ipcRenderer.invoke("bilan:generer", { debut, fin }),
  /**
   * CORRECTION (2026-10-28) : `donnees` est désormais le bilan déjà
   * affiché à l'écran (renvoyé par `genererBilan` ci-dessus) — jamais
   * recalculé une seconde fois côté Main, pour que le PDF corresponde
   * toujours exactement à ce que l'utilisateur voit au moment du clic.
   */
  genererBilanPdf: (
    debut: string,
    fin: string,
    periodeLibelle: string,
    donnees: {
      ventes: { caTotal: number; nombreFactures: number; remiseTotale: number };
      topProduits: { label: string; quantite: number }[];
      mouvements: { totalEntrees: number; totalSorties: number };
      stockParEmplacement: { emplacementId: string; nom: string; cartons: number }[];
      produitsSousSeuilCount: number;
      promotionsActivesPendantPeriode: number;
      depots: { id: string; nom: string }[];
      detailProduits: {
        produitId: string;
        motif: string;
        taille: string;
        reference: string;
        stockParEmplacement: { emplacementId: string; cartons: number }[];
        vendu: number;
        sortie: number;
      }[];
    }
  ): Promise<{ success: boolean; chemin?: string; nomSuggere?: string; message?: string }> =>
    ipcRenderer.invoke("bilan:genererPdf", { debut, fin, periodeLibelle, donnees }),
  lireDocumentBase64: (chemin: string): Promise<{ success: boolean; base64?: string; message?: string }> =>
    ipcRenderer.invoke("documents:lireBase64", chemin),
  telechargerDocument: (chemin: string, nomSuggere: string): Promise<{ success: boolean; canceled?: boolean; chemin?: string; message?: string }> =>
    ipcRenderer.invoke("documents:telecharger", chemin, nomSuggere),
  changerStatutFacture: (
    factureId: string,
    nouveauStatut: "reservation" | "payee_non_livree" | "payee_livree"
  ): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("factures:changerStatut", factureId, nouveauStatut),
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
  getIdentiteEntreprise: (): Promise<{
    nom: string;
    adresse: string;
    quartier: string;
    telephones: string[];
    whatsapp: string;
    email: string;
    nomAdministrateur: string | null;
    nomGerant: string | null;
  }> => ipcRenderer.invoke("parametres:getIdentite"),
  setIdentiteEntreprise: (identite: {
    nom: string;
    adresse: string;
    quartier: string;
    telephones: string[];
    whatsapp: string;
    email: string;
    nomAdministrateur: string | null;
    nomGerant: string | null;
  }): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("parametres:setIdentite", identite),
  /**
   * Amorçage ponctuel de `stock_central` — correction "pc annexe ne peut
   * pas vendre malgré le stock réel" (2026-10-27). Réservé à
   * l'Administrateur (vérifié côté Main, jamais seulement masqué ici).
   */
  initialiserStockCentral: (): Promise<{ success: boolean; lignesAppliquees?: number; message?: string }> =>
    ipcRenderer.invoke("stock:initialiserCentral"),
  renommerEmplacement: (id: string, nouveauNom: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("emplacements:renommer", id, nouveauNom),
  creerDepot: (nom: string): Promise<{ success: boolean; id?: string; message?: string }> => ipcRenderer.invoke("emplacements:creerDepot", nom),
  archiverEmplacement: (
    id: string
  ): Promise<{ success: boolean; message?: string; stockRestant?: { motif: string; taille: string; quantite: number }[] }> =>
    ipcRenderer.invoke("emplacements:archiver", id),
  reactiverEmplacement: (id: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke("emplacements:reactiver", id),
  verifierEmplacementsSuppressibles: (ids: string[]): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke("emplacements:verifierSuppressibles", ids),
  supprimerEmplacementDefinitivement: (id: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("emplacements:supprimerDefinitivement", id),
  getDonneesPourModification: (
    factureId: string
  ): Promise<{
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    modeReglement: string | null;
    remise: number;
    statutPaiement: "reservation" | "payee";
    montantPaye: number;
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
  listHistoriqueEnrichiPagine: (filtres: {
    recherche: string;
    typeFiltre: "tous" | "vente" | "annulation" | "entree" | "sortie" | "transfert";
    periode: "tout" | "jour" | "semaine" | "mois" | "personnalise";
    dateDebut: string;
    dateFin: string;
    colonneTri: "date" | "type" | "montant" | null;
    direction: "asc" | "desc";
    page: number;
    tailleParPage: number;
  }): Promise<{
    resultats: EvenementHistorique[];
    totalResultats: number;
    page: number;
    totalPages: number;
    tailleParPage: number;
    compteurs: Record<string, number>;
  }> => ipcRenderer.invoke("historique:listEnrichiPagine", filtres),
  listEntreesCompletes: (): Promise<EvenementHistorique[]> => ipcRenderer.invoke("stock:listEntrees"),
  listSortiesCompletes: (): Promise<EvenementHistorique[]> => ipcRenderer.invoke("stock:listSorties"),
  listTransfertsComplets: (): Promise<EvenementHistorique[]> => ipcRenderer.invoke("stock:listTransferts"),

  getDashboardSummary: (): Promise<{
    stockTousDepots: number;
    caTotal: number;
    /** Correction "voir le revenu journalier et mensuel" (2026-10-21). */
    caJour: number;
    caMois: number;
    produitsSousSeuilGlobal: number;
    totalFactures: number;
    totalProduits: number;
    totalEntrees: number;
    totalSorties: number;
    promotionsActives: number;
    serieEntreesSorties: { jour: string; entrees: number; sorties: number }[];
    stockParEmplacement: { emplacementId: string; nom: string; cartons: number; referencesEnRupture: number }[];
    topProduitsVendus: { label: string; quantite: number }[];
    produitsSousSeuilListe: { id: string; modeleId: string | null; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[];
    activiteRecente: EvenementHistorique[];
    stockDepots: number;
    stockParEmplacementPourGerant: { emplacementId: string; nom: string; cartons: number; referencesEnRupture: number }[];
    mesVentesAujourdhui: number;
    monChiffreAffaires: number;
    monChiffreAffairesMois: number;
    mesFacturesAujourdhuiCount: number;
    mesEntrees: number;
    mesSorties: number;
  } | null> => ipcRenderer.invoke("dashboard:summary"),

  // --- Images produit (liées au modèle depuis la migration multi-format) ---
  // Le Renderer ne reçoit jamais de chemin de fichier — uniquement des
  // images déjà encodées (data URL), lues et converties côté Main.
  listImages: (modeleId: string): Promise<ImageAffichable[]> => ipcRenderer.invoke("images:list", modeleId),
  pickAndAddImages: (modeleId: string): Promise<{ success: boolean; added?: number; message?: string }> =>
    ipcRenderer.invoke("images:pickAndAdd", modeleId),
  setImagePrincipale: (modeleId: string, imageId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("images:setPrincipale", modeleId, imageId),
  removeImage: (imageId: string): Promise<{ success: boolean }> => ipcRenderer.invoke("images:remove", imageId),

  // Mécanisme de "staging" — prévisualisation réelle avant même que le
  // modèle n'existe (formulaire de création).
  pickFilesToStaging: (): Promise<{ success: boolean; staged?: StagedImage[]; message?: string }> =>
    ipcRenderer.invoke("images:pickFilesToStaging"),
  commitStagedImages: (modeleId: string, stagingIds: string[], principaleStagingId: string | null): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("images:commitStaged", modeleId, stagingIds, principaleStagingId),
  discardStagedImages: (stagingIds: string[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("images:discardStaged", stagingIds),

  // --- Catalogue multi-format (modèles + variantes) ---
  listModelesProduits: (): Promise<ModeleProduitAvecVariantes[]> =>
    ipcRenderer.invoke("catalogue:listModeles"),
  /** Vitrine du site (2026-10-07) : enregistre la sélection ET l'ordre complets (voir ModeleRepository.definirVitrine). */
  definirVitrineModeles: (modeleIds: string[]): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("catalogue:definirVitrine", modeleIds),
  creerModeleProduit: (input: {
    motif: string;
    type: string;
    variantes: VarianteInput[];
    stagedImages?: string[];
    principaleStagingId?: string | null;
  }): Promise<{ success: boolean; id?: string; message?: string }> =>
    ipcRenderer.invoke("catalogue:creerModele", input),
  modifierModeleProduit: (
    modeleId: string,
    input: { motif?: string; type?: string }
  ): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("catalogue:modifierModele", modeleId, input),
  supprimerModeleProduit: (modeleId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("catalogue:supprimerModele", modeleId),
  ajouterVariante: (
    modeleId: string,
    input: VarianteInput
  ): Promise<{ success: boolean; id?: string; message?: string }> =>
    ipcRenderer.invoke("catalogue:ajouterVariante", modeleId, input),
  modifierVariante: (
    varianteId: string,
    input: Partial<VarianteInput>
  ): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("catalogue:modifierVariante", varianteId, input),
  supprimerVariante: (varianteId: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("catalogue:supprimerVariante", varianteId),

  // --- Promotions ---
  // Lister et gérer les promotions : mutation réservée aux Administrateurs,
  // lecture des actives disponible aux deux rôles (prix barrés à la vente).
  promotionsLister: (): Promise<{ success: boolean; data?: import("@maxi-equip/shared-types").Promotion[]; message?: string }> =>
    ipcRenderer.invoke("promotions:lister"),
  promotionsActives: (): Promise<{ success: boolean; data?: import("@maxi-equip/shared-types").Promotion[]; message?: string }> =>
    ipcRenderer.invoke("promotions:actives"),
  promotionsCompterActives: (): Promise<number> =>
    ipcRenderer.invoke("promotions:compterActives"),
  promotionsCreer: (
    input: Omit<import("@maxi-equip/shared-types").Promotion, "id" | "createdAt" | "updatedAt">
  ): Promise<{ success: boolean; data?: import("@maxi-equip/shared-types").Promotion; message?: string; conflits?: import("@maxi-equip/shared-types").Promotion[] }> =>
    ipcRenderer.invoke("promotions:creer", input),
  promotionsModifier: (
    id: string,
    input: Partial<Omit<import("@maxi-equip/shared-types").Promotion, "id" | "createdAt" | "updatedAt">>
  ): Promise<{ success: boolean; data?: import("@maxi-equip/shared-types").Promotion; message?: string; conflits?: import("@maxi-equip/shared-types").Promotion[] }> =>
    ipcRenderer.invoke("promotions:modifier", id, input),
  promotionsSupprimer: (id: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("promotions:supprimer", id),

  // --- Gestion des utilisateurs (Administrateur uniquement) ---
  // Le contrôle d'accès est également appliqué côté Main à chaque appel —
  // jamais uniquement côté Renderer.
  utilisateursLister: (): Promise<{ success: boolean; data?: UtilisateurPublic[]; message?: string }> =>
    ipcRenderer.invoke("utilisateurs:list"),
  utilisateurCreer: (input: {
    nom: string;
    identifiant: string;
    role: string;
    motDePasse: string;
    confirmation: string;
  }): Promise<{ success: boolean; id?: string; message?: string }> =>
    ipcRenderer.invoke("utilisateurs:creer", input),
  utilisateurModifier: (
    id: string,
    input: { nom?: string; role?: string; identifiant?: string }
  ): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("utilisateurs:modifier", id, input),
  utilisateurReinitialiserMotDePasse: (
    id: string,
    input: { motDePasse: string; confirmation: string }
  ): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("utilisateurs:reinitialiserMotDePasse", id, input),
  utilisateurDesactiver: (id: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("utilisateurs:desactiver", id),
  utilisateurActiver: (id: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("utilisateurs:activer", id),
};

export type MaxiEquipApi = typeof maxiEquipApi;

contextBridge.exposeInMainWorld("maxiEquip", maxiEquipApi);
