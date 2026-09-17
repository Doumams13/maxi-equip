import { ValidationError } from "./errors.js";
import type { OperationRecue, TypeOperationSync } from "./storeServeur.js";

/**
 * Validation des données de synchronisation reçues — Phase 3.6, Partie 4.
 *
 * RÈGLE ABSOLUE : ne jamais faire confiance aux données reçues, même
 * d'une application authentifiée (un jeton JWT valide prouve QUI parle,
 * jamais QUE ce qui est envoyé est correct).
 *
 * Types supportés : EXACTEMENT ceux réellement préparés par la Phase 3.3
 * (`boite_envoi.entity_type`) — vente, annulation, entrée, transfert,
 * demande (Phase 4.1 — point d'entrée réel pour la future Phase 5, le
 * site vitrine : seul type poussé PAR le serveur/site plutôt que par
 * l'application elle-même, jamais un système de synchronisation
 * parallèle).
 */

const TYPES_SUPPORTES: readonly TypeOperationSync[] = ["vente", "annulation", "entree", "transfert", "demande", "parametres_entreprise"];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOMBRE_MAX_OPERATIONS_PAR_LOT = 500;
const TAILLE_MAX_PAYLOAD_OCTETS = 100_000;

function estUuidValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && UUID_REGEX.test(valeur);
}

function estObjetPlain(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

export function validerRequetePush(body: unknown): OperationRecue[] {
  if (!estObjetPlain(body)) {
    throw new ValidationError("Le corps de la requête doit être un objet JSON.");
  }
  const operations = (body as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) {
    throw new ValidationError("Le champ 'operations' doit être un tableau.");
  }
  if (operations.length === 0) {
    throw new ValidationError("Le tableau 'operations' ne peut pas être vide.");
  }
  if (operations.length > NOMBRE_MAX_OPERATIONS_PAR_LOT) {
    throw new ValidationError(`Un lot ne peut pas contenir plus de ${NOMBRE_MAX_OPERATIONS_PAR_LOT} opérations.`);
  }

  return operations.map((item, index) => {
    if (!estObjetPlain(item)) {
      throw new ValidationError(`Opération à l'index ${index} : doit être un objet.`);
    }
    const { entityType, entityId, payload } = item as Record<string, unknown>;

    if (typeof entityType !== "string" || !TYPES_SUPPORTES.includes(entityType as TypeOperationSync)) {
      throw new ValidationError(`Opération à l'index ${index} : entityType invalide ou non supporté ("${String(entityType)}").`);
    }
    if (!estUuidValide(entityId)) {
      throw new ValidationError(`Opération à l'index ${index} : entityId doit être un UUID valide.`);
    }
    if (payload === undefined || payload === null) {
      throw new ValidationError(`Opération à l'index ${index} : payload obligatoire.`);
    }
    if (!estObjetPlain(payload) && !Array.isArray(payload)) {
      throw new ValidationError(`Opération à l'index ${index} : payload doit être un objet ou un tableau JSON.`);
    }
    const tailleOctets = Buffer.byteLength(JSON.stringify(payload), "utf-8");
    if (tailleOctets > TAILLE_MAX_PAYLOAD_OCTETS) {
      throw new ValidationError(`Opération à l'index ${index} : payload trop volumineux (${tailleOctets} octets, maximum ${TAILLE_MAX_PAYLOAD_OCTETS}).`);
    }

    return { entityType: entityType as TypeOperationSync, entityId, payload };
  });
}

/** Valide le paramètre `since` du PULL — doit être un entier positif ou absent (0 par défaut, jamais négatif). */
export function validerCurseurPull(valeurBrute: string | undefined): number {
  if (valeurBrute === undefined || valeurBrute === "") return 0;
  const curseur = Number(valeurBrute);
  if (!Number.isInteger(curseur) || curseur < 0) {
    throw new ValidationError("Le paramètre 'since' doit être un entier positif ou nul.");
  }
  return curseur;
}
