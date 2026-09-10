import { signerJwt } from "./jwt.js";

/**
 * Émission des jetons RÉELLEMENT destinés à une application MAXI-EQUIP
 * — correction "Phase 3.5.1 — Consolidation API", Parties 2 à 6.
 *
 * ═══════════════════════════════════════════════════════════════════
 * DISTINCTION VOLONTAIRE (Partie 2) : AUTHENTIFICATION UTILISATEUR
 * vs AUTHENTIFICATION APPLICATION/INSTALLATION
 * ═══════════════════════════════════════════════════════════════════
 * Le JWT vérifié par l'API (`core/jwt.ts`) ne représente PAS un compte
 * utilisateur humain — MAXI-EQUIP possède déjà son propre système de
 * comptes (Administrateur/Gérant) entièrement LOCAL à chaque
 * installation, jamais connu du serveur central. Le `sub` d'un jeton
 * applicatif représente l'INSTALLATION elle-même (le poste MAXI-EQUIP
 * qui synchronise), jamais la personne connectée dessus au moment de la
 * synchronisation. Ce sont deux couches d'authentification différentes,
 * volontairement jamais confondues :
 *   - Utilisateur → Application locale : déjà géré (Phase 1/2, Argon2id).
 *   - Application → API centrale : ce module, jamais les deux mélangés.
 *
 * ═══════════════════════════════════════════════════════════════════
 * POURQUOI AUCUNE ROUTE D'ÉMISSION N'EST CRÉÉE MAINTENANT (Partie 5)
 * ═══════════════════════════════════════════════════════════════════
 * Une route `POST /token` accessible publiquement donnerait un jeton
 * valide à quiconque l'appelle — inacceptable. Émettre un jeton en
 * toute sécurité nécessite une PREUVE PRÉALABLE que l'appelant est
 * réellement une installation MAXI-EQUIP légitime (un identifiant
 * d'installation + un secret partagé, ou un mécanisme équivalent) —
 * cette preuve n'existe pas encore dans l'architecture actuelle (une
 * seule installation, aucune table d'installations, comme voulu). Créer
 * la route maintenant reviendrait donc soit à l'exposer sans protection
 * réelle, soit à inventer prématurément la table/l'identifiant
 * d'installation que la Partie 6 demande explicitement de NE PAS créer
 * maintenant.
 *
 * Ce module fournit donc uniquement la fonction minimale et sûre
 * (`emettreJetonApplication`) — appelable en interne dès qu'un
 * mécanisme d'authentification d'installation existera (Phase 3.6 ou
 * ultérieure), sans qu'aucune route publique n'y donne accès aujourd'hui.
 *
 * ═══════════════════════════════════════════════════════════════════
 * IDENTITÉ TECHNIQUE FUTURE (Partie 6) — DOCUMENTATION UNIQUEMENT
 * ═══════════════════════════════════════════════════════════════════
 * `sub` accepte dès aujourd'hui n'importe quelle chaîne — c'est
 * délibéré et suffisant pour la version actuelle (une seule
 * installation). Le jour où plusieurs installations existeront, `sub`
 * devra contenir l'identifiant technique UNIQUE de l'installation
 * (probablement un UUID généré une fois localement à la première
 * synchronisation, suivant exactement le même principe déjà utilisé
 * pour toutes les autres entités du projet — `randomUUID()`). AUCUNE
 * table `installations`, aucun identifiant d'appareil, aucune gestion
 * multi-base n'est créée par cette étape — uniquement documenté ici
 * pour que cette évolution future n'exige pas de tout refaire.
 */

/**
 * Durée par défaut d'un jeton applicatif — 24h. Une valeur raisonnable
 * pour une synchronisation qui doit rester possible pendant une journée
 * de travail sans réémission, sans laisser un jeton vivre indéfiniment
 * (Partie 4 : "éviter qu'un JWT de synchronisation réel puisse vivre
 * indéfiniment sans contrôle"). Modifiable par l'appelant si un besoin
 * réel apparaît plus tard — jamais une valeur imposée arbitrairement
 * sans possibilité d'ajustement.
 */
export const DUREE_JETON_APPLICATION_PAR_DEFAUT_SECONDES = 24 * 60 * 60;

export class EmissionJetonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmissionJetonError";
  }
}

/**
 * Émet un jeton RÉELLEMENT destiné à une application/installation
 * MAXI-EQUIP. Contrairement à `signerJwt()` (générique, technique,
 * utilisé aussi par les tests pour fabriquer des jetons sans expiration
 * afin de vérifier ce cas précis), cette fonction n'accepte JAMAIS une
 * expiration nulle ou absente — une durée strictement positive est
 * obligatoire, avec une valeur par défaut raisonnable si l'appelant n'en
 * précise pas une autre (Partie 4 de la correction).
 */
export function emettreJetonApplication(
  identiteClient: string,
  secret: string,
  dureeSecondes: number = DUREE_JETON_APPLICATION_PAR_DEFAUT_SECONDES
): string {
  if (!identiteClient || identiteClient.trim().length === 0) {
    throw new EmissionJetonError("L'identité technique du client (sub) est obligatoire pour émettre un jeton applicatif.");
  }
  if (!Number.isFinite(dureeSecondes) || dureeSecondes <= 0) {
    throw new EmissionJetonError("Un jeton applicatif réel doit toujours avoir une durée de validité strictement positive — jamais un jeton sans expiration.");
  }
  return signerJwt({ sub: identiteClient, role: "app" }, secret, dureeSecondes);
}
