/**
 * Abstraction de la persistance serveur — Bloc 1 (remédiation
 * pré-production, PostgreSQL). Avant cette étape, `storeServeur.ts` et
 * `catalogStore.ts` dépendaient directement de `better-sqlite3` — aucune
 * route ne parlait SQL en direct (déjà correct), mais une seule
 * implémentation existait. Cette interface définit le contrat commun ;
 * `sqliteServerStorage.ts` (développement/tests, inchangé dans son
 * comportement) et `postgresServerStorage.ts` (production) l'implémentent
 * chacune. Le domaine métier (`@maxi-equip/domain`) n'est PAS concerné :
 * ce fichier ne fait que persister/relire des projections, jamais une
 * règle métier (voir catalogStore.ts, publicCatalog.ts).
 */

export type TypeOperationSync =
  | "vente"
  | "annulation"
  | "entree"
  | "sortie"
  | "transfert"
  | "demande"
  | "parametres_entreprise"
  | "promotion"
  | "modele"
  | "produit"
  | "compte";

export interface OperationRecue {
  entityType: TypeOperationSync;
  entityId: string;
  payload: unknown;
}

export interface OperationStockee {
  curseur: number;
  entityType: string;
  entityId: string;
  payload: unknown;
  recuLe: string;
}

export interface ResultatEnregistrement {
  entityId: string;
  statut: "cree" | "deja_traite";
}

export interface ResultatPull {
  operations: OperationStockee[];
  hasMore: boolean;
}

export interface ModeleCataloguePayload {
  operation: "create" | "update" | "delete";
  modeleId: string;
  motif: string;
  type: string;
  /** Position d'affichage dans la vitrine de l'accueil du site (null = non sélectionné) — voir shared-types/produit.ts côté app. */
  ordreVitrine: number | null;
  updatedAt: string;
}

export interface ProduitCataloguePayload {
  operation: "create" | "update" | "delete";
  produitId: string;
  modeleId: string;
  taille: string;
  tailleTri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  prix: number;
  updatedAt: string;
}

export interface PromotionCataloguePayload {
  operation: "create" | "update" | "delete";
  promotionId: string;
  libelle: string;
  typeReduction: "pourcentage" | "montant_fixe";
  valeur: number;
  perimetre: "global" | "cible";
  produitIds: string[];
  dateDebut: string;
  dateFin: string;
  updatedAt: string;
}

export interface ImageSyncPayload {
  operation: "create" | "update" | "delete";
  imageId: string;
  modeleId: string;
  kind: "produit" | "logo";
  ordre: number;
  estPrincipale: boolean;
  updatedAt: string;
}

/**
 * Identité entreprise — correction "L'appli gère les infos du site" :
 * singleton (pas de `operation`/`entityId` UUID — une seule ligne existe
 * toujours, jamais supprimée), poussé par l'écran Paramètres de l'app.
 * Mêmes garanties d'idempotence/ordre que le catalogue (upsert
 * conditionné par `updatedAt`), pour la même raison : une entité mutable
 * poussée plusieurs fois ne doit jamais passer par le journal immuable
 * `operations_synchronisees` (contrainte UNIQUE(entity_type, entity_id)
 * + `INSERT OR IGNORE` — une deuxième modification de la même entité
 * serait silencieusement ignorée, jamais appliquée).
 */
export interface IdentiteCataloguePayload {
  nom: string;
  adresse: string;
  quartier: string;
  telephones: string[];
  whatsapp: string;
  email: string;
  updatedAt: string;
}

export interface IdentiteRow {
  nom: string;
  adresse: string;
  quartier: string;
  telephones: string[];
  whatsapp: string;
  email: string;
  updatedAt: string;
}

/**
 * Compte utilisateur — correction "travail à distance / plusieurs
 * machines en parallèle" (2026-10-22). Avant cette correction, un compte
 * créé par l'Administrateur n'existait que dans le SQLite local du poste
 * qui l'a créé (voir authService.ts côté Electron, "fonctionne entièrement
 * hors-ligne") — inutilisable depuis un autre poste. Même mécanisme de
 * projection idempotente que modele/produit/identite (upsert conditionné
 * par `updatedAt`), poussé par l'écran Utilisateurs de l'app à chaque
 * création/modification/désactivation.
 *
 * `hashMotDePasse` : hash Argon2id calculé CÔTÉ ELECTRON (mêmes
 * paramètres que core/argon2Hasher.ts, voir
 * packages/electron-app/src/main/auth/argon2Hasher.ts) — jamais le mot de
 * passe en clair transmis à ce stade (contrairement au mot de passe de
 * récupération d'installation, qui lui transite en clair une seule fois
 * pour que le SERVEUR le hache lui-même, voir
 * recuperationInstallationStore.ts : ce n'est pas le même besoin ici,
 * l'app a déjà le hash qu'elle doit de toute façon stocker localement).
 */
export interface CompteCataloguePayload {
  operation: "create" | "update" | "delete";
  compteId: string;
  identifiant: string;
  hashMotDePasse: string;
  nom: string;
  role: string;
  actif: boolean;
  updatedAt: string;
}

export interface CompteRow {
  id: string;
  identifiant: string;
  hashMotDePasse: string;
  nom: string;
  role: string;
  actif: boolean;
}

/**
 * Demande de validation atomique d'une opération de stock — correction
 * "travailler en parallèle sur le même stock" (2026-10-22). AUCUNE vente
 * ni mouvement ne doit jamais se baser sur le stock local lorsque la
 * synchronisation est configurée (décision utilisateur explicite) : cette
 * méthode est le SEUL endroit où une quantité de stock partagée est
 * réellement vérifiée et décrémentée/incrémentée, dans une unique
 * transaction serveur avec verrou de ligne — la 2ᵉ requête concurrente
 * attend naturellement que la 1ʳᵉ ait validé/appliqué la sienne avant de
 * vérifier à son tour (jamais une file d'attente applicative maison,
 * jamais nécessaire : un verrou de ligne SQL suffit).
 *
 * `deltas` : un delta signé par (produit, emplacement) — négatif pour une
 * sortie/vente, positif pour une entrée, DEUX lignes pour un transfert
 * (négatif à la source, positif à la destination). Toujours exprimé en
 * variation relative, jamais en valeur absolue (même principe que
 * `Mouvement.quantite` côté app, voir shared-types/stock.ts).
 *
 * `demandeNumeroFacture` : présent uniquement pour une vente — `prefix`
 * déjà calculé côté app (ex. "FAC-2026-", voir factureRepository.nextNumero()
 * côté Electron — format `FAC-AAAA-XXXX` inchangé, jamais un nouveau
 * format introduit par cette correction), le serveur attribue le
 * PROCHAIN numéro (4 chiffres, complété de zéros à gauche) de façon
 * atomique dans la MÊME transaction que la vérification du stock, pour
 * que les deux garanties (pas de survente, pas de numéro de facture en
 * double) soient obtenues ensemble ou pas du tout.
 */
export interface DemandeValidationStock {
  deltas: { produitId: string; emplacementId: string; delta: number }[];
  demandeNumeroFacture?: { prefix: string };
}

export type ResultatValidationStock =
  | {
      success: true;
      numero?: string;
      stockApres: { produitId: string; emplacementId: string; quantite: number }[];
    }
  | {
      success: false;
      raison: "stock_insuffisant";
      details: { produitId: string; emplacementId: string; disponible: number; demande: number }[];
    };

/**
 * Amorçage ponctuel de `stock_central` — correction "pc annexe ne peut
 * pas vendre malgré le stock réel" (2026-10-27). `stock_central` part
 * toujours de 0 et n'est alimentée QUE par des opérations déjà validées
 * en ligne (voir `validerEtAppliquerOperationStock`) : un poste qui
 * vendait encore uniquement en local avant d'activer la validation
 * distante n'y a jamais rien inscrit, donc son stock réel — pourtant
 * bien réel — y est invisible. Cette opération fixe une quantité
 * ABSOLUE (jamais un delta, contrairement à `validerEtAppliquerOperationStock`) :
 * destinée à être envoyée UNE SEULE FOIS, depuis le poste qui détient le
 * vrai stock à jour (voir `StockRepository.listTout()` côté Electron).
 */
export interface LigneInitialisationStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
}

/**
 * Lecture complète de `stock_central` — correction "vente sur un poste
 * annexe non répercutée sur le PC Shop après 10+ minutes" (2026-10-27).
 * `stock_central` est déjà la source de vérité partagée (alimentée par
 * `validerEtAppliquerOperationStock`/`initialiserStockCentral`), mais
 * jusqu'ici RIEN ne la relisait jamais côté client : un poste ne
 * rafraîchit sa copie LOCALE d'un produit que lorsqu'IL réalise lui-même
 * une opération validée en ligne sur ce produit (voir VenteService/
 * StockService, qui appliquent `stockApres` reçu). Un poste resté
 * inactif sur un produit ne voit donc jamais les ventes faites ailleurs,
 * même indéfiniment. Cette lecture est volontairement intégrale (jamais
 * paginée/filtrée) : le volume reste celui du catalogue produit × dépôt,
 * du même ordre que `listerImagesActives()` déjà relu en entier à chaque
 * cycle de synchronisation.
 */
export interface LigneStockCentral {
  produitId: string;
  emplacementId: string;
  quantite: number;
}

export interface ModeleRow {
  id: string;
  motif: string;
  type: string;
  slug: string;
  ordreVitrine: number | null;
  updatedAt: string;
}

export interface ProduitRow {
  id: string;
  modeleId: string;
  taille: string;
  tailleTri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  prix: number;
}

export interface ImageRow {
  id: string;
  modeleId: string;
  ordre: number;
  estPrincipale: boolean;
  url: string | null;
}

export interface PromotionRow {
  id: string;
  libelle: string;
  typeReduction: "pourcentage" | "montant_fixe";
  valeur: number;
  perimetre: "global" | "cible";
  produitIds: string[];
  dateDebut: string;
  dateFin: string;
}

/**
 * Contrat commun — TOUTES les méthodes sont asynchrones (même
 * l'implémentation SQLite, synchrone en interne) pour que les deux
 * implémentations soient interchangeables sans jamais toucher aux routes
 * ni aux fonctions métier qui les appellent.
 */
export interface ServerStorage {
  fermer(): Promise<void>;

  enregistrerOperations(operations: OperationRecue[]): Promise<ResultatEnregistrement[]>;
  listerOperationsDepuis(curseur: number, limite?: number): Promise<ResultatPull>;

  appliquerOperationModele(payload: ModeleCataloguePayload): Promise<{ applique: boolean }>;
  appliquerOperationProduit(payload: ProduitCataloguePayload): Promise<{ applique: boolean }>;
  appliquerOperationPromotion(payload: PromotionCataloguePayload): Promise<{ applique: boolean }>;
  upsertImageMeta(payload: ImageSyncPayload, fichier?: { url: string; filename: string }): Promise<{ applique: boolean }>;
  findImageFilename(imageId: string): Promise<string | null>;
  appliquerOperationIdentite(payload: IdentiteCataloguePayload): Promise<{ applique: boolean }>;

  appliquerOperationCompte(payload: CompteCataloguePayload): Promise<{ applique: boolean }>;
  trouverCompteParIdentifiant(identifiant: string): Promise<CompteRow | null>;

  validerEtAppliquerOperationStock(demande: DemandeValidationStock): Promise<ResultatValidationStock>;
  initialiserStockCentral(lignes: LigneInitialisationStock[]): Promise<{ lignesAppliquees: number }>;
  listerStockCentral(): Promise<LigneStockCentral[]>;

  listerModelesActifs(): Promise<ModeleRow[]>;
  listerProduitsActifs(): Promise<ProduitRow[]>;
  listerImagesActives(): Promise<ImageRow[]>;
  listerPromotionsActives(): Promise<PromotionRow[]>;
  getIdentiteActuelle(): Promise<IdentiteRow | null>;

  /**
   * Mot de passe de récupération d'installation — singleton (même
   * principe que l'identité entreprise), un seul hash Argon2id existe
   * jamais plus d'une ligne. Voir core/recuperationInstallationStore.ts
   * pour le raisonnement complet.
   *
   * `cleChiffreeSauvegarde` : copie de la clé de chiffrement SQLCipher de
   * l'installation, elle-même chiffrée côté Electron avec CE MÊME mot de
   * passe (voir packages/electron-app/src/main/services/backupCrypto.ts,
   * `protegerCleParMotDePasse`) — jamais en clair ici, le serveur ne
   * fait que stocker un blob opaque (JSON sérialisé) qu'il ne peut pas
   * déchiffrer lui-même. Permet à une restauration cloud d'ouvrir la
   * base téléchargée sur un NOUVEAU poste, ce que le mécanisme cloud
   * existant ne permettait pas (la clé ne quittait jamais la machine
   * d'origine) — voir l'échange sur le vol du PC Shop.
   *
   * `cleChiffreeCloudBackup` : même principe, pour les identifiants
   * CLOUD_BACKUP_* (bucket/région/endpoint/clé B2 du PC Shop) — permet à
   * une installation restaurée de reprendre l'upload de ses propres
   * sauvegardes cloud SANS qu'aucune variable d'environnement ne soit
   * jamais retouchée après un vol (décision explicite : le propriétaire
   * doit pouvoir s'en sortir seul, même sans contact avec nous).
   */
  definirRecuperation(
    hashArgon2id: string,
    cleChiffreeSauvegardeJson: string | null,
    cleChiffreeCloudBackupJson: string | null
  ): Promise<void>;
  getRecuperationHash(): Promise<string | null>;
  getRecuperationCleChiffree(): Promise<string | null>;
  getRecuperationCleChiffreeCloudBackup(): Promise<string | null>;
}

/** Convertit un texte libre en slug URL déterministe (minuscules, sans accents, séparé par des tirets) — identique pour les deux implémentations. */
export function slugify(texte: string): string {
  const base = texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "modele";
}
