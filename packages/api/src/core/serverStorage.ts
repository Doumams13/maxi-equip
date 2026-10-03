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
  | "produit";

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

export interface ModeleRow {
  id: string;
  motif: string;
  type: string;
  slug: string;
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
