import { auth as domainAuth } from "@maxi-equip/domain";
import type { Role } from "@maxi-equip/shared-types";
import type { UtilisateurRepository } from "./utilisateurRepository.js";
import type { SessionManager } from "./sessionManager.js";
import type { LoginCentralService } from "./loginCentralService.js";

/**
 * Service d'authentification — couche "services" (§15) qui orchestre :
 * domaine (règles pures) + repository (accès SQLite) + hasher (Argon2id
 * réel) + session (état en mémoire). Aucune de ces couches ne connaît les
 * autres directement — c'est ce service qui les assemble.
 *
 * Fonctionne entièrement hors-ligne (§8) — SAUF correction "travail à
 * distance / plusieurs machines en parallèle" (2026-10-22) : dès que la
 * synchronisation est configurée sur ce poste, la connexion passe par le
 * serveur central (voir `loginEnLigne` ci-dessous), décision utilisateur
 * explicite (un compte doit être utilisable depuis n'importe quel poste
 * synchronisé). Sur un poste SANS synchronisation configurée (y compris
 * le tout premier compte Administrateur, créé avant toute configuration
 * réseau), rien ne change : ce fichier se comporte exactement comme
 * avant cette correction.
 */

/** Motifs d'échec propres à la connexion EN LIGNE — jamais dans packages/domain, qui ignore tout du réseau/de la synchronisation. */
export type RaisonEchecConnexionCentrale = "CONNEXION_REQUISE" | "TROP_DE_TENTATIVES" | "POSTE_BLOQUE";

export type LoginOutcome =
  | { success: true; session: domainAuth.SessionLocale }
  | { success: false; reason: domainAuth.AuthenticationFailureReason | RaisonEchecConnexionCentrale; message?: string };

export class AuthService {
  constructor(
    private readonly repository: UtilisateurRepository,
    private readonly hasher: domainAuth.PasswordHasher,
    private readonly session: SessionManager,
    /**
     * OPTIONNEL pour ne jamais casser un site d'appel existant (tests) qui
     * construirait ce service sans lui : absent, comportement 100% local
     * inchangé. Présent ET configuré (voir `estConfiguree()`), toute
     * connexion passe par lui — jamais un mélange des deux pour le même
     * poste.
     */
    private readonly loginCentralService?: LoginCentralService
  ) {}

  async login(identifiant: string, motDePasseEnClair: string): Promise<LoginOutcome> {
    if (this.loginCentralService?.estConfiguree()) {
      return this.loginEnLigne(identifiant, motDePasseEnClair);
    }

    const utilisateur = this.repository.findByIdentifiant(identifiant);
    const result = await domainAuth.authenticate(utilisateur, motDePasseEnClair, this.hasher);

    if (!result.success) {
      return { success: false, reason: result.reason };
    }

    // utilisateur est nécessairement non-null ici : authenticate() n'aurait
    // pas pu renvoyer success:true avec un utilisateur null.
    const sessionLocale: domainAuth.SessionLocale = {
      userId: result.userId,
      identifiant: utilisateur!.identifiant,
      nom: this.repository.findById(result.userId)?.nom ?? utilisateur!.identifiant,
      role: result.role,
      authentifieLe: new Date().toISOString(),
    };

    this.session.set(sessionLocale);
    return { success: true, session: sessionLocale };
  }

  private async loginEnLigne(identifiant: string, motDePasseEnClair: string): Promise<LoginOutcome> {
    const resultat = await this.loginCentralService!.login(identifiant, motDePasseEnClair);
    if (!resultat.success) {
      const reason: domainAuth.AuthenticationFailureReason | RaisonEchecConnexionCentrale =
        resultat.raison === "identifiants_invalides"
          ? "WRONG_PASSWORD"
          : resultat.raison === "trop_de_tentatives"
            ? "TROP_DE_TENTATIVES"
            : resultat.raison === "poste_bloque"
              ? "POSTE_BLOQUE"
              : "CONNEXION_REQUISE";
      return { success: false, reason, message: resultat.message };
    }

    // Rôle déjà validé côté serveur (ROLES, voir packages/api/validationCatalogueSync.ts)
    // avant d'être accepté en base — jamais revalidé une seconde fois ici.
    const role = resultat.compte.role as Role;
    this.repository.upsertDepuisConnexionCentrale({ id: resultat.compte.id, identifiant: resultat.compte.identifiant, nom: resultat.compte.nom, role });

    const sessionLocale: domainAuth.SessionLocale = {
      userId: resultat.compte.id,
      identifiant: resultat.compte.identifiant,
      nom: resultat.compte.nom,
      role,
      authentifieLe: new Date().toISOString(),
    };
    this.session.set(sessionLocale);
    return { success: true, session: sessionLocale };
  }

  logout(): void {
    this.session.clear();
  }

  /**
   * Vérifie le mot de passe de l'utilisateur ACTUELLEMENT connecté, sans
   * jamais modifier la session en cours (contrairement à login(), qui
   * l'écraserait) — nécessaire pour la double validation par mot de
   * passe des Paramètres (données sensibles). Réutilise la même
   * fonction domaine que la connexion, jamais une seconde logique de
   * vérification créée séparément.
   */
  async verifierMotDePasseActuel(motDePasseEnClair: string): Promise<boolean> {
    const sessionActuelle = this.session.get();
    if (!sessionActuelle) return false;
    const utilisateur = this.repository.findByIdentifiant(sessionActuelle.identifiant);
    const result = await domainAuth.authenticate(utilisateur, motDePasseEnClair, this.hasher);
    return result.success;
  }

  getSession(): domainAuth.SessionLocale | null {
    return this.session.get();
  }

  getPermissions(): domainAuth.PermissionSet | null {
    const session = this.session.get();
    if (!session) return null;
    return domainAuth.getPermissionSet(session.role);
  }
}
