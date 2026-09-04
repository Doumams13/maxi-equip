import type { Role } from "@maxi-equip/shared-types";

/**
 * Interface d'un service de hachage de mot de passe. Le domaine définit
 * le CONTRAT (§16 — "conçu de manière testable"), jamais l'implémentation
 * cryptographique réelle : celle-ci vit dans le processus principal de
 * l'application (Argon2id — Synthèse §2/§3), qui dépend de Node.js et
 * d'une bibliothèque de hachage. Le domaine reste ainsi totalement
 * indépendant d'Electron/Node/SQLite (§1, §15), tout en exprimant des
 * règles réellement vérifiables sur l'authentification.
 *
 * Ce découplage permet aussi de tester les règles métier (compte inactif,
 * mauvais mot de passe, rôle...) sans jamais calculer un vrai hachage
 * Argon2id dans les tests unitaires — un faux hasher déterministe suffit.
 */
export interface PasswordHasher {
  hash(motDePasseEnClair: string): Promise<string>;
  verify(motDePasseEnClair: string, hash: string): Promise<boolean>;
}

/** Vue minimale d'un utilisateur nécessaire à l'authentification (sous-ensemble de Utilisateur). */
export interface UtilisateurAuthentifiable {
  id: string;
  identifiant: string;
  passwordHash: string;
  role: Role;
  actif: boolean;
}

export type AuthenticationFailureReason = "USER_NOT_FOUND" | "USER_INACTIVE" | "WRONG_PASSWORD";

export type AuthenticationResult =
  | { success: true; userId: string; role: Role }
  | { success: false; reason: AuthenticationFailureReason };

/**
 * Les trois états de connectivité de l'application — Synthèse §7,
 * Corrections §1. L'authentification locale (authenticate.ts) ne dépend
 * JAMAIS de cet état : elle fonctionne identiquement quel que soit l'état
 * ci-dessous, hors-ligne comme en ligne (§8 du prompt Phase 1 — aucun
 * blocage après X jours, aucune dépendance au cloud pour ouvrir l'app).
 *
 * - "hors_ligne"     : aucune connexion détectée.
 * - "synchronise"    : connexion disponible, jeton de session valide.
 * - "acces_refuse"   : connexion disponible, mais le jeton de session est
 *                      rejeté par le serveur (ex. révocation distante).
 *                      Ne bloque QUE la synchronisation cloud, jamais
 *                      l'usage local de l'application (Corrections §1).
 */
export type AccessState = "hors_ligne" | "synchronise" | "acces_refuse";

/**
 * Session locale authentifiée (Synthèse §7, Corrections §1).
 * Ne contient jamais le mot de passe ni son hachage — uniquement ce qui
 * est nécessaire pour que l'interface (Renderer) sache qui est connecté
 * et quels droits appliquer, sans jamais manipuler de secret.
 */
export interface SessionLocale {
  userId: string;
  identifiant: string;
  nom: string;
  role: Role;
  authentifieLe: string;
}
