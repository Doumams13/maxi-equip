import type { auth } from "@maxi-equip/domain";
import { UtilisateurRepository } from "./utilisateurRepository.js";

/**
 * Amorce les deux comptes actifs de la V1 (Synthèse §9) s'ils n'existent
 * pas encore. La Phase 1 ne construit pas d'écran de gestion des
 * utilisateurs (CRUD complet réservé à la Phase 4) — il faut néanmoins
 * deux comptes réels et fonctionnels pour que l'authentification soit
 * testable de bout en bout dès maintenant (§18 du prompt : "vérifie les
 * deux rôles").
 *
 * IMPORTANT — mots de passe temporaires de la Phase 1 :
 * Ces identifiants sont documentés ici en clair volontairement (ce ne
 * sont pas des secrets réels, seulement des valeurs de démarrage à usage
 * de test/développement) et seront à remplacer par un vrai mécanisme de
 * création de compte lors de la Phase 4 (gestion des utilisateurs).
 * Aucun mot de passe en clair n'est jamais stocké : chacun est haché en
 * Argon2id avant écriture en base, exactement comme pour tout autre
 * compte créé ultérieurement.
 */
const COMPTES_PAR_DEFAUT = [
  { nom: "Administrateur", identifiant: "admin", motDePasseTemporaire: "MaxiEquip2026!", role: "administrateur" as const },
  { nom: "Gérant", identifiant: "gerant", motDePasseTemporaire: "MaxiEquip2026!", role: "gerant" as const },
];

export async function bootstrapDefaultUsers(repository: UtilisateurRepository, hasher: auth.PasswordHasher): Promise<void> {
  if (repository.count() > 0) {
    return; // Des comptes existent déjà — ne jamais écraser des données réelles (§14).
  }

  for (const compte of COMPTES_PAR_DEFAUT) {
    const passwordHash = await hasher.hash(compte.motDePasseTemporaire);
    repository.create({
      nom: compte.nom,
      identifiant: compte.identifiant,
      passwordHash,
      role: compte.role,
    });
  }
}
