import { ValidationError } from "./errors.js";
import type { ModeleCataloguePayload, ProduitCataloguePayload, PromotionCataloguePayload, ImageSyncPayload } from "./catalogStore.js";
import type { IdentiteCataloguePayload } from "./identiteStore.js";
import type { CompteCataloguePayload } from "./compteStore.js";
import type { EmplacementCataloguePayload } from "./emplacementStore.js";
import type { CategorieCataloguePayload, SousCategorieCataloguePayload, SousCategorieChampCataloguePayload } from "./referentielStore.js";

/**
 * Validation stricte des opérations catalogue reçues (modèle, produit,
 * promotion — via `/v1/sync/push` ; image — via `/v1/app/images/sync`).
 * Même règle que pour les demandes publiques et le push existant : ne
 * jamais faire confiance aux données reçues, même envoyées par
 * l'application authentifiée.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATIONS = new Set(["create", "update", "delete"]);
const LONGUEUR_MAX_TEXTE = 200;

function estObjetPlain(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function uuid(valeur: unknown, champ: string): string {
  if (typeof valeur !== "string" || !UUID_REGEX.test(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être un UUID valide.`);
  }
  return valeur;
}

function operation(valeur: unknown): "create" | "update" | "delete" {
  if (typeof valeur !== "string" || !OPERATIONS.has(valeur)) {
    throw new ValidationError(`Le champ 'operation' doit être 'create', 'update' ou 'delete' (reçu : ${String(valeur)}).`);
  }
  return valeur as "create" | "update" | "delete";
}

function texte(valeur: unknown, champ: string, maxLongueur = LONGUEUR_MAX_TEXTE): string {
  if (typeof valeur !== "string" || !valeur.trim()) {
    throw new ValidationError(`Le champ '${champ}' est obligatoire.`);
  }
  const nettoye = valeur.trim();
  if (nettoye.length > maxLongueur) {
    throw new ValidationError(`Le champ '${champ}' dépasse la longueur maximale autorisée (${maxLongueur} caractères).`);
  }
  return nettoye;
}

function nombre(valeur: unknown, champ: string): number {
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être un nombre.`);
  }
  return valeur;
}

function nombreOuNull(valeur: unknown, champ: string): number | null {
  if (valeur === null || valeur === undefined) return null;
  return nombre(valeur, champ);
}

/** Contrairement à `texte()`, une chaîne vide est acceptée (ex. WhatsApp/email laissés vides intentionnellement — voir ParametresScreen.tsx côté app, "laissez vide pour ne rien afficher"). */
function texteOuVide(valeur: unknown, champ: string, maxLongueur = LONGUEUR_MAX_TEXTE): string {
  if (typeof valeur !== "string") {
    throw new ValidationError(`Le champ '${champ}' doit être une chaîne de caractères.`);
  }
  const nettoye = valeur.trim();
  if (nettoye.length > maxLongueur) {
    throw new ValidationError(`Le champ '${champ}' dépasse la longueur maximale autorisée (${maxLongueur} caractères).`);
  }
  return nettoye;
}

function dateIso(valeur: unknown, champ: string): string {
  if (typeof valeur !== "string" || Number.isNaN(new Date(valeur).getTime())) {
    throw new ValidationError(`Le champ '${champ}' doit être une date ISO 8601 valide.`);
  }
  return valeur;
}

/** Phase 5 (référentiel commun) — UUID optionnel : `null`/`undefined` accepté (ex. un modèle pas encore classé), jamais une chaîne invalide. */
function uuidOuNull(valeur: unknown, champ: string): string | null {
  if (valeur === null || valeur === undefined) return null;
  return uuid(valeur, champ);
}

/**
 * Texte optionnel, jamais tronqué/retouché (contrairement à `texte()`/
 * `texteOuVide()`, qui trim) — utilisé pour des champs qui doivent
 * transiter EXACTEMENT tels que saisis/sérialisés côté client (ex.
 * `caracteristiques`, une chaîne JSON déjà sérialisée dont l'espacement
 * ne doit jamais être altéré par le serveur).
 */
function texteOuNull(valeur: unknown, champ: string, maxLongueur?: number): string | null {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur !== "string") {
    throw new ValidationError(`Le champ '${champ}' doit être une chaîne de caractères ou null.`);
  }
  if (maxLongueur !== undefined && valeur.length > maxLongueur) {
    throw new ValidationError(`Le champ '${champ}' dépasse la longueur maximale autorisée (${maxLongueur} caractères).`);
  }
  return valeur;
}

const UNITES_VENTE = new Set(["carton", "piece", "sac", "metre", "kg", "litre"]);

/** Phase 5 — unité de vente optionnelle (voir shared-types/produit.ts côté app, UniteVente) : `null` = comportement historique (carton). */
function uniteVenteOuNull(valeur: unknown, champ: string): string | null {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur !== "string" || !UNITES_VENTE.has(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être l'une des unités autorisées ou null (reçu : ${String(valeur)}).`);
  }
  return valeur;
}

export function validerOperationModele(payload: unknown): ModeleCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'modele' doit être un objet.");
  return {
    operation: operation(payload["operation"]),
    modeleId: uuid(payload["modeleId"], "modeleId"),
    motif: texte(payload["motif"], "motif"),
    type: texte(payload["type"], "type"),
    ordreVitrine: nombreOuNull(payload["ordreVitrine"], "ordreVitrine"),
    // Phase 5 (référentiel commun) — nullable : un ancien poste pas
    // encore mis à jour, ou un modèle legacy jamais classé, n'envoie
    // jamais ces deux champs — jamais une exigence bloquante.
    sousCategorieId: uuidOuNull(payload["sousCategorieId"], "sousCategorieId"),
    marque: texteOuNull(payload["marque"], "marque", 150),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

export function validerOperationProduit(payload: unknown): ProduitCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'produit' doit être un objet.");
  return {
    operation: operation(payload["operation"]),
    produitId: uuid(payload["produitId"], "produitId"),
    modeleId: uuid(payload["modeleId"], "modeleId"),
    taille: texte(payload["taille"], "taille", 50),
    tailleTri: nombre(payload["tailleTri"], "tailleTri"),
    largeur: nombreOuNull(payload["largeur"], "largeur"),
    hauteur: nombreOuNull(payload["hauteur"], "hauteur"),
    reference: texte(payload["reference"], "reference", 100),
    prix: nombre(payload["prix"], "prix"),
    // Phase 5 (référentiel commun) — tous les trois nullable, même
    // raisonnement que modele.sousCategorieId ci-dessus. `caracteristiques`
    // est une chaîne JSON déjà sérialisée côté client (voir
    // shared-types/caracteristiques.ts) : jamais reparsée/revalidée ici,
    // jamais une seconde logique métier (déjà bornée par le plafond
    // générique de 100 Ko du corps de la requête, validationSync.ts).
    uniteVente: uniteVenteOuNull(payload["uniteVente"], "uniteVente"),
    caracteristiques: texteOuNull(payload["caracteristiques"], "caracteristiques"),
    marque: texteOuNull(payload["marque"], "marque", 150),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

export function validerOperationPromotion(payload: unknown): PromotionCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'promotion' doit être un objet.");
  const perimetre = payload["perimetre"];
  if (perimetre !== "global" && perimetre !== "cible") {
    throw new ValidationError("Le champ 'perimetre' doit être 'global' ou 'cible'.");
  }
  const typeReduction = payload["typeReduction"];
  if (typeReduction !== "pourcentage" && typeReduction !== "montant_fixe") {
    throw new ValidationError("Le champ 'typeReduction' doit être 'pourcentage' ou 'montant_fixe'.");
  }
  const produitIdsBrut = payload["produitIds"];
  if (!Array.isArray(produitIdsBrut)) {
    throw new ValidationError("Le champ 'produitIds' doit être un tableau.");
  }
  const produitIds = produitIdsBrut.map((id, i) => uuid(id, `produitIds[${i}]`));

  return {
    operation: operation(payload["operation"]),
    promotionId: uuid(payload["promotionId"], "promotionId"),
    libelle: texte(payload["libelle"], "libelle", 100),
    typeReduction,
    valeur: nombre(payload["valeur"], "valeur"),
    perimetre,
    produitIds,
    dateDebut: dateIso(payload["dateDebut"], "dateDebut"),
    dateFin: dateIso(payload["dateFin"], "dateFin"),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

/**
 * Identité entreprise — correction "L'appli gère les infos du site".
 * Singleton, jamais de `operation`/UUID d'entité (une seule ligne
 * existe toujours, jamais supprimée) — seul `nom` reste obligatoire
 * (même règle que côté app, voir ParametresRepository.setIdentite).
 */
export function validerOperationIdentite(payload: unknown): IdentiteCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'parametres_entreprise' doit être un objet.");

  const telephonesBrut = payload["telephones"];
  if (!Array.isArray(telephonesBrut)) {
    throw new ValidationError("Le champ 'telephones' doit être un tableau.");
  }
  const telephones = telephonesBrut.map((t, i) => texteOuVide(t, `telephones[${i}]`, 50)).filter((t) => t.length > 0);

  return {
    nom: texte(payload["nom"], "nom", 150),
    adresse: texteOuVide(payload["adresse"], "adresse", 300),
    quartier: texteOuVide(payload["quartier"], "quartier", 150),
    telephones,
    whatsapp: texteOuVide(payload["whatsapp"], "whatsapp", 50),
    email: texteOuVide(payload["email"], "email", 200),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

const ROLES = new Set(["administrateur", "gerant"]);

/**
 * Compte utilisateur — correction "travail à distance / plusieurs
 * machines en parallèle" (2026-10-22). `hashMotDePasse` est un hash
 * Argon2id déjà calculé côté Electron (jamais un mot de passe en clair
 * ici, voir serverStorage.ts/CompteCataloguePayload) — ce champ n'est
 * donc volontairement PAS limité en longueur par `texte()` (un hash
 * encodé Argon2id dépasse largement 200 caractères).
 */
export function validerOperationCompte(payload: unknown): CompteCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'compte' doit être un objet.");
  const role = payload["role"];
  if (typeof role !== "string" || !ROLES.has(role)) {
    throw new ValidationError("Le champ 'role' doit être 'administrateur' ou 'gerant'.");
  }
  const hashMotDePasse = payload["hashMotDePasse"];
  if (typeof hashMotDePasse !== "string" || hashMotDePasse.length === 0) {
    throw new ValidationError("Le champ 'hashMotDePasse' est obligatoire.");
  }

  return {
    operation: operation(payload["operation"]),
    compteId: uuid(payload["compteId"], "compteId"),
    identifiant: texte(payload["identifiant"], "identifiant", 100),
    hashMotDePasse,
    nom: texte(payload["nom"], "nom", 150),
    role,
    actif: Boolean(payload["actif"]),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

const TYPES_EMPLACEMENT = new Set(["shop", "depot"]);

/**
 * Dépôt/point de vente — correction "visibilité croisée Factures/
 * Historique entre postes" (2026-10-27). Même raisonnement que
 * `validerOperationCompte` ci-dessus (projection mutable).
 */
export function validerOperationEmplacement(payload: unknown): EmplacementCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'emplacement' doit être un objet.");
  const type = payload["type"];
  if (typeof type !== "string" || !TYPES_EMPLACEMENT.has(type)) {
    throw new ValidationError("Le champ 'type' doit être 'shop' ou 'depot'.");
  }

  return {
    operation: operation(payload["operation"]),
    emplacementId: uuid(payload["emplacementId"], "emplacementId"),
    nom: texte(payload["nom"], "nom", 150),
    type: type as "shop" | "depot",
    ville: texte(payload["ville"], "ville", 150),
    estPointDeVente: Boolean(payload["estPointDeVente"]),
    actif: Boolean(payload["actif"]),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

/**
 * Référentiel commun du catalogue — Phase 5 (voir
 * PHASE_5_CAHIER_DES_CHARGES.md). Même rigueur de validation que le
 * reste de ce fichier : ne jamais faire confiance aux données reçues.
 */

export function validerOperationCategorie(payload: unknown): CategorieCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'categorie' doit être un objet.");
  return {
    operation: operation(payload["operation"]),
    categorieId: uuid(payload["categorieId"], "categorieId"),
    nom: texte(payload["nom"], "nom", 150),
    // Potentiellement une image encodée en base64 — déjà bornée par le
    // plafond générique de 100 Ko du corps de la requête
    // (validationSync.ts) ; cette limite locale est un filet de sécurité
    // supplémentaire, jamais une seconde contrainte indépendante.
    imageDataUrl: texteOuNull(payload["imageDataUrl"], "imageDataUrl", 150_000),
    ordre: nombre(payload["ordre"], "ordre"),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

const MODELES_PHYSIQUES = new Set(["carreau"]);

function modelePhysiqueOuNull(valeur: unknown, champ: string): "carreau" | null {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur !== "string" || !MODELES_PHYSIQUES.has(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être 'carreau' ou null (reçu : ${String(valeur)}).`);
  }
  return valeur as "carreau";
}

type UniteVenteValide = "carton" | "piece" | "sac" | "metre" | "kg" | "litre";

/**
 * `null` = sous-catégorie non configurée (les 6 unités restent
 * proposées par défaut) ; un tableau REFUSE explicitement d'être vide
 * (même règle que `domain/catalogue.validerConfigurationUnites` côté
 * app : une configuration explicite autorise toujours au moins une
 * unité, jamais persistée autrement).
 */
function unitesAutoriseesOuNull(valeur: unknown, champ: string): UniteVenteValide[] | null {
  if (valeur === null || valeur === undefined) return null;
  if (!Array.isArray(valeur) || valeur.length === 0) {
    throw new ValidationError(`Le champ '${champ}' doit être un tableau non vide d'unités autorisées, ou null.`);
  }
  return valeur.map((v, i) => {
    if (typeof v !== "string" || !UNITES_VENTE.has(v)) {
      throw new ValidationError(`Le champ '${champ}[${i}]' doit être une unité autorisée valide (reçu : ${String(v)}).`);
    }
    return v as UniteVenteValide;
  });
}

export function validerOperationSousCategorie(payload: unknown): SousCategorieCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'sous_categorie' doit être un objet.");
  return {
    operation: operation(payload["operation"]),
    sousCategorieId: uuid(payload["sousCategorieId"], "sousCategorieId"),
    categorieId: uuid(payload["categorieId"], "categorieId"),
    nom: texte(payload["nom"], "nom", 150),
    ordre: nombre(payload["ordre"], "ordre"),
    modelePhysique: modelePhysiqueOuNull(payload["modelePhysique"], "modelePhysique"),
    unitesAutorisees: unitesAutoriseesOuNull(payload["unitesAutorisees"], "unitesAutorisees"),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

const TYPES_CHAMP = new Set(["texte", "nombre", "liste"]);
const ROLES_CHAMP = new Set(["descriptif", "physique", "calcul"]);

function typeChampValide(valeur: unknown, champ: string): "texte" | "nombre" | "liste" {
  if (typeof valeur !== "string" || !TYPES_CHAMP.has(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être 'texte', 'nombre' ou 'liste' (reçu : ${String(valeur)}).`);
  }
  return valeur as "texte" | "nombre" | "liste";
}

function roleChampOuNull(valeur: unknown, champ: string): "descriptif" | "physique" | "calcul" | null {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur !== "string" || !ROLES_CHAMP.has(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être 'descriptif', 'physique', 'calcul' ou null (reçu : ${String(valeur)}).`);
  }
  return valeur as "descriptif" | "physique" | "calcul";
}

function valeursAutoriseesOuNull(valeur: unknown, champ: string): string[] | null {
  if (valeur === null || valeur === undefined) return null;
  if (!Array.isArray(valeur)) {
    throw new ValidationError(`Le champ '${champ}' doit être un tableau de chaînes, ou null.`);
  }
  return valeur.map((v, i) => texte(v, `${champ}[${i}]`, 100));
}

export function validerOperationSousCategorieChamp(payload: unknown): SousCategorieChampCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'sous_categorie_champ' doit être un objet.");
  return {
    operation: operation(payload["operation"]),
    champId: uuid(payload["champId"], "champId"),
    sousCategorieId: uuid(payload["sousCategorieId"], "sousCategorieId"),
    nom: texte(payload["nom"], "nom", 150),
    type: typeChampValide(payload["type"], "type"),
    obligatoire: Boolean(payload["obligatoire"]),
    valeursAutorisees: valeursAutoriseesOuNull(payload["valeursAutorisees"], "valeursAutorisees"),
    uniteMesure: texteOuNull(payload["uniteMesure"], "uniteMesure", 50),
    role: roleChampOuNull(payload["role"], "role"),
    ordre: nombre(payload["ordre"], "ordre"),
    updatedAt: dateIso(payload["updatedAt"], "updatedAt"),
  };
}

const KINDS = new Set(["produit", "logo"]);
export const TAILLE_MAX_IMAGE_OCTETS = 8 * 1024 * 1024; // 8 Mo décodés
export const TYPES_IMAGE_ACCEPTES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ImageSyncPayloadValide {
  payload: ImageSyncPayload;
  contenu: { base64: string; contentType: string } | null;
}

export function validerOperationImage(body: unknown): ImageSyncPayloadValide {
  if (!estObjetPlain(body)) throw new ValidationError("Le corps de la requête doit être un objet JSON.");

  const kind = body["kind"];
  if (kind !== undefined && !KINDS.has(kind as string)) {
    throw new ValidationError("Le champ 'kind' doit être 'produit' ou 'logo'.");
  }

  const payload: ImageSyncPayload = {
    operation: operation(body["operation"]),
    imageId: uuid(body["imageId"], "imageId"),
    modeleId: uuid(body["modeleId"], "modeleId"),
    kind: (kind as ImageSyncPayload["kind"]) ?? "produit",
    ordre: typeof body["ordre"] === "number" ? body["ordre"] : 0,
    estPrincipale: Boolean(body["estPrincipale"]),
    updatedAt: dateIso(body["updatedAt"], "updatedAt"),
  };

  if (payload.operation === "delete") {
    return { payload, contenu: null };
  }

  const contentBase64 = body["contentBase64"];
  const contentType = body["contentType"];
  if (contentBase64 === undefined || contentBase64 === null) {
    // Mise à jour de métadonnées seule (réordonner, changer l'image principale) — aucun nouvel octet envoyé.
    return { payload, contenu: null };
  }

  if (typeof contentBase64 !== "string" || !contentBase64) {
    throw new ValidationError("Le champ 'contentBase64' doit être une chaîne base64 non vide.");
  }
  if (typeof contentType !== "string" || !TYPES_IMAGE_ACCEPTES[contentType]) {
    throw new ValidationError("Le champ 'contentType' doit être 'image/jpeg', 'image/png' ou 'image/webp'.");
  }

  const tailleApprox = Math.ceil((contentBase64.length * 3) / 4);
  if (tailleApprox > TAILLE_MAX_IMAGE_OCTETS) {
    throw new ValidationError(`Image trop volumineuse (maximum ${TAILLE_MAX_IMAGE_OCTETS} octets).`);
  }

  return { payload, contenu: { base64: contentBase64, contentType } };
}
