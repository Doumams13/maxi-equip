import { ValidationError } from "./errors.js";

/**
 * Validation de la soumission publique d'une demande — correction
 * "Intégration Site Phase 5". Convertit le contrat du site
 * (`OrderRequestInput`, packages/site/src/lib/types/request.ts) vers le
 * payload interne "demande" déjà attendu par
 * `DemandeService.creerDepuisReception()` côté application (Phase 4.1)
 * — jamais un nouveau format inventé côté serveur.
 *
 * RÈGLE ABSOLUE : ne jamais faire confiance aux données reçues — cette
 * route est en plus PUBLIQUE et NON AUTHENTIFIÉE, donc revalidée avec
 * au moins autant de rigueur que les routes "app".
 */

const NOMBRE_MAX_LIGNES = 50;
const QUANTITE_MAX_PAR_LIGNE = 10_000;
const LONGUEUR_MAX_TEXTE_COURT = 200;
const LONGUEUR_MAX_COMMENTAIRE = 2000;

export interface DemandePubliquePayload {
  clientNom: string;
  clientTelephone: string;
  clientAdresse: string;
  clientEmail: string | null;
  commentaire: string | null;
  lignes: { produitId: string; motif: string; taille: string; quantite: number; prixIndicatif: number }[];
}

function estObjetPlain(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function texteNonVide(valeur: unknown, champ: string, maxLongueur = LONGUEUR_MAX_TEXTE_COURT): string {
  if (typeof valeur !== "string" || !valeur.trim()) {
    throw new ValidationError(`Le champ '${champ}' est obligatoire.`);
  }
  const nettoye = valeur.trim();
  if (nettoye.length > maxLongueur) {
    throw new ValidationError(`Le champ '${champ}' dépasse la longueur maximale autorisée (${maxLongueur} caractères).`);
  }
  return nettoye;
}

function texteFacultatif(valeur: unknown, champ: string, maxLongueur: number): string | null {
  if (valeur === undefined || valeur === null || valeur === "") return null;
  if (typeof valeur !== "string") throw new ValidationError(`Le champ '${champ}' doit être une chaîne de caractères.`);
  const nettoye = valeur.trim();
  if (nettoye.length > maxLongueur) {
    throw new ValidationError(`Le champ '${champ}' dépasse la longueur maximale autorisée (${maxLongueur} caractères).`);
  }
  return nettoye || null;
}

/**
 * Résultat spécial (jamais une exception) pour le cas honeypot rempli —
 * la décision de l'ignorer est une responsabilité SERVEUR. Traité comme
 * une "fausse acceptation silencieuse" — jamais un indice qu'un piège a
 * été détecté, sans jamais réellement enregistrer la demande.
 */
export const HONEYPOT_DECLENCHE = Symbol("honeypot_declenche");

export function validerDemandePublique(body: unknown): DemandePubliquePayload | typeof HONEYPOT_DECLENCHE {
  if (!estObjetPlain(body)) {
    throw new ValidationError("Le corps de la requête doit être un objet JSON.");
  }

  const honeypot = body["websiteHoneypot"];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return HONEYPOT_DECLENCHE;
  }

  const clientNom = texteNonVide(body["customerName"], "customerName");
  const clientTelephone = texteNonVide(body["phone"], "phone");
  const clientAdresse = texteNonVide(body["location"], "location");
  const clientEmail = texteFacultatif(body["email"], "email", LONGUEUR_MAX_TEXTE_COURT);
  const commentaire = texteFacultatif(body["comment"], "comment", LONGUEUR_MAX_COMMENTAIRE);

  const lignesBrutes = body["lines"];
  if (!Array.isArray(lignesBrutes) || lignesBrutes.length === 0) {
    throw new ValidationError("Le champ 'lines' doit être un tableau non vide.");
  }
  if (lignesBrutes.length > NOMBRE_MAX_LIGNES) {
    throw new ValidationError(`Une demande ne peut pas contenir plus de ${NOMBRE_MAX_LIGNES} lignes.`);
  }

  const lignes = lignesBrutes.map((ligne, index) => {
    if (!estObjetPlain(ligne)) throw new ValidationError(`La ligne à l'index ${index} doit être un objet.`);

    const variantId = texteNonVide(ligne["variantId"], `lines[${index}].variantId`);
    const productModelName = texteNonVide(ligne["productModelName"], `lines[${index}].productModelName`);
    const size = texteNonVide(ligne["size"], `lines[${index}].size`, 50);

    const quantity = ligne["quantity"];
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0 || quantity > QUANTITE_MAX_PAR_LIGNE) {
      throw new ValidationError(`lines[${index}].quantity doit être un entier strictement positif (maximum ${QUANTITE_MAX_PAR_LIGNE}).`);
    }

    const unitPriceFcfa = ligne["unitPriceFcfa"];
    if (typeof unitPriceFcfa !== "number" || !Number.isFinite(unitPriceFcfa) || unitPriceFcfa < 0) {
      throw new ValidationError(`lines[${index}].unitPriceFcfa doit être un nombre positif ou nul.`);
    }

    return { produitId: variantId, motif: productModelName, taille: size, quantite: quantity, prixIndicatif: unitPriceFcfa };
  });

  return { clientNom, clientTelephone, clientAdresse, clientEmail, commentaire, lignes };
}
