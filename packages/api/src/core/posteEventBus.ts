/**
 * Bus d'évènements en mémoire — système multiposte fiable (2026-10-28),
 * Phase F. Signal MINIMAL serveur→client ("quelque chose a changé, va
 * resynchroniser"), jamais la donnée elle-même — voir
 * routes/v1/app/sync/stream (httpAdapter.ts) et push.ts, le seul
 * émetteur. Échelle triviale (~6 connexions au maximum : Shop + 5 PCX,
 * voir serverStorage.ts/PosteRow) — un simple `Map` en mémoire, dans
 * l'unique processus Node de production, suffit ; aucune file de
 * messages externe n'est justifiée à cette échelle.
 *
 * `fermerPoste` — système multiposte fiable, Phase D/F : un poste
 * bloqué doit voir sa connexion de flux fermée ACTIVEMENT (voir
 * postes/bloquer.ts), pas seulement son prochain cycle de synchro
 * refusé — jamais une connexion ouverte oubliée malgré le blocage.
 */
export interface EvenementFlux {
  type: string;
}

export interface ConnexionFlux {
  notifier: (evenement: EvenementFlux) => void;
  fermer: () => void;
}

export class PosteEventBus {
  private readonly connexions = new Map<string, Set<ConnexionFlux>>();

  /** Retourne la fonction de désabonnement — appelée à la fermeture de la connexion HTTP (voir httpAdapter.ts). */
  enregistrer(posteId: string, connexion: ConnexionFlux): () => void {
    let ensemble = this.connexions.get(posteId);
    if (!ensemble) {
      ensemble = new Set();
      this.connexions.set(posteId, ensemble);
    }
    ensemble.add(connexion);
    return () => {
      const ensembleActuel = this.connexions.get(posteId);
      if (!ensembleActuel) return;
      ensembleActuel.delete(connexion);
      if (ensembleActuel.size === 0) this.connexions.delete(posteId);
    };
  }

  /** Diffuse à TOUS les postes actuellement connectés — jamais filtré par origine, un signal reçu en écho par son propre émetteur est sans effet (il ne trouvera rien de nouveau à synchroniser). */
  diffuser(evenement: EvenementFlux): void {
    for (const ensemble of this.connexions.values()) {
      for (const connexion of ensemble) connexion.notifier(evenement);
    }
  }

  /** Ferme ACTIVEMENT toute connexion ouverte pour ce poste (voir postes/bloquer.ts) — jamais seulement un désabonnement passif. */
  fermerPoste(posteId: string): void {
    const ensemble = this.connexions.get(posteId);
    if (!ensemble) return;
    for (const connexion of [...ensemble]) connexion.fermer();
  }

  /** Réservé aux tests/diagnostics. */
  compterConnexions(posteId: string): number {
    return this.connexions.get(posteId)?.size ?? 0;
  }
}

let instance: PosteEventBus | null = null;

/** Singleton par processus — même principe que `getStorage()` (storeServeur.ts). */
export function getPosteEventBus(): PosteEventBus {
  if (!instance) instance = new PosteEventBus();
  return instance;
}

/** Réservé aux tests — jamais appelé par le code de production. */
export function reinitialiserPosteEventBusPourTests(): void {
  instance = new PosteEventBus();
}
