import type { AuthenticationResult, PasswordHasher, UtilisateurAuthentifiable } from "./types.js";

/**
 * Authentifie un utilisateur à partir de son mot de passe en clair.
 *
 * Fonctionne entièrement HORS LIGNE (Synthèse §2/§3, Corrections §1) :
 * aucune dépendance réseau, uniquement une comparaison locale du mot de
 * passe fourni avec le hachage déjà stocké. Le `hasher` est injecté
 * (jamais importé directement) pour que ce module reste indépendant de
 * toute bibliothèque cryptographique concrète — voir types.ts.
 *
 * @param utilisateur L'utilisateur trouvé par son identifiant, ou `null`
 *   si aucun compte ne correspond (résolu par l'appelant via un dépôt de
 *   données — hors du domaine).
 */
export async function authenticate(
  utilisateur: UtilisateurAuthentifiable | null,
  motDePasseEnClair: string,
  hasher: PasswordHasher
): Promise<AuthenticationResult> {
  if (!utilisateur) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }
  if (!utilisateur.actif) {
    return { success: false, reason: "USER_INACTIVE" };
  }

  const motDePasseValide = await hasher.verify(motDePasseEnClair, utilisateur.passwordHash);
  if (!motDePasseValide) {
    return { success: false, reason: "WRONG_PASSWORD" };
  }

  return { success: true, userId: utilisateur.id, role: utilisateur.role };
}
