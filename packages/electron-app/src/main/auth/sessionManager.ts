import type { auth } from "@maxi-equip/domain";

/**
 * État de session locale, conservé UNIQUEMENT en mémoire du processus
 * principal — jamais persisté sur disque, jamais transmis au Renderer
 * autrement que via les champs non sensibles exposés par getSession()
 * côté IPC (§7, §12 du prompt Phase 1).
 *
 * Une nouvelle authentification est nécessaire à chaque démarrage de
 * l'application — comportement volontaire pour un poste de vente
 * partagé, cohérent avec l'existence de deux comptes distincts (§4).
 */
export class SessionManager {
  private current: auth.SessionLocale | null = null;

  set(session: auth.SessionLocale): void {
    this.current = session;
  }

  clear(): void {
    this.current = null;
  }

  get(): auth.SessionLocale | null {
    return this.current;
  }

  isAuthenticated(): boolean {
    return this.current !== null;
  }
}
