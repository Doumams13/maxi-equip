import { ValidationError } from "./errors.js";
import type { ModeleCataloguePayload, ProduitCataloguePayload, PromotionCataloguePayload, ImageSyncPayload } from "./catalogStore.js";
import type { IdentiteCataloguePayload } from "./identiteStore.js";
import type { CompteCataloguePayload } from "./compteStore.js";
import type { EmplacementCataloguePayload } from "./emplacementStore.js";

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

export function validerOperationModele(payload: unknown): ModeleCataloguePayload {
  if (!estObjetPlain(payload)) throw new ValidationError("Le payload 'modele' doit être un objet.");
  return {
    operation: operation(payload["operation"]),
    modeleId: uuid(payload["modeleId"], "modeleId"),
    motif: texte(payload["motif"], "motif"),
    type: texte(payload["type"], "type"),
    ordreVitrine: nombreOuNull(payload["ordreVitrine"], "ordreVitrine"),
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
