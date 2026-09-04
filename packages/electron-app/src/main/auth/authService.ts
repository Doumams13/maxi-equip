import { auth as domainAuth } from "@maxi-equip/domain";
import type { UtilisateurRepository } from "./utilisateurRepository.js";
import type { SessionManager } from "./sessionManager.js";

/**
 * Service d'authentification — couche "services" (§15) qui orchestre :
 * domaine (règles pures) + repository (accès SQLite) + hasher (Argon2id
 * réel) + session (état en mémoire). Aucune de ces couches ne connaît les
 * autres directement — c'est ce service qui les assemble.
 *
 * Fonctionne entièrement hors-ligne (§8) : aucune des étapes ci-dessous
 * ne dépend du réseau.
 */

export type LoginOutcome =
  | { success: true; session: domainAuth.SessionLocale }
  | { success: false; reason: domainAuth.AuthenticationFailureReason };

export class AuthService {
  constructor(
    private readonly repository: UtilisateurRepository,
    private readonly hasher: domainAuth.PasswordHasher,
    private readonly session: SessionManager
  ) {}

  async login(identifiant: string, motDePasseEnClair: string): Promise<LoginOutcome> {
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

  logout(): void {
    this.session.clear();
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
