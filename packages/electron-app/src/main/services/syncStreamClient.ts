import { getConfigurationSync } from "./syncConfig.js";

const DELAI_INITIAL_RECONNEXION_MS = 2_000;
const DELAI_MAX_RECONNEXION_MS = 60_000;
/** Pas de synchro configurée (installation indépendante, ou pas encore restaurée) — jamais un appel réseau, revérifié périodiquement. */
const DELAI_VERIFICATION_CONFIGURATION_MS = 60_000;

/**
 * Lecteur du flux SSE serveur→client — système multiposte fiable
 * (2026-10-28), Phase F. Synchronisation quasi instantanée : déclenche
 * un cycle de synchro normal (callback fourni par l'appelant, voir
 * main/index.ts — `lancerSyncAutomatique`, le MÊME que le minuteur de 5
 * minutes) dès la réception d'un signal, SANS jamais appliquer de
 * donnée lui-même — la notification d'une opération n'est jamais
 * confondue avec son application effective (voir SyncService), qui
 * reste strictement le rôle du cycle normal.
 *
 * Isolation garantie (même garde que partout ailleurs dans ce
 * projet) : AUCUN appel réseau si `jwt` n'est pas configuré. Jamais un
 * remplacement du cycle périodique de 5 minutes (voir main/index.ts),
 * qui reste le filet de sécurité en cas de signal manqué (poste
 * resté fermé, coupure réseau pendant l'émission...).
 *
 * Reconnexion avec attente croissante plafonnée (2s → 4s → ... → 60s),
 * remise à zéro dès qu'une connexion est réellement établie — jamais
 * une tentative immédiate en boucle qui marteler le serveur après une
 * coupure prolongée.
 */
export class SyncStreamClient {
  private arrete = true;
  private controller: AbortController | null = null;
  private delaiReconnexionMs = DELAI_INITIAL_RECONNEXION_MS;

  constructor(private readonly onSignal: () => void) {}

  demarrer(): void {
    if (!this.arrete) return;
    this.arrete = false;
    void this.boucle();
  }

  arreter(): void {
    this.arrete = true;
    this.controller?.abort();
  }

  private async boucle(): Promise<void> {
    while (!this.arrete) {
      const { apiUrl, jwt } = getConfigurationSync();
      if (!jwt) {
        await this.attendre(DELAI_VERIFICATION_CONFIGURATION_MS);
        continue;
      }

      this.controller = new AbortController();
      try {
        const reponse = await fetch(`${apiUrl}/v1/app/sync/stream`, {
          headers: { Authorization: `Bearer ${jwt}` },
          signal: this.controller.signal,
        });
        if (!reponse.ok || !reponse.body) {
          throw new Error(`Flux refusé par le serveur (HTTP ${reponse.status}).`);
        }

        // Connexion réellement établie — remise à zéro de l'attente de
        // reconnexion (jamais conservée d'une précédente coupure).
        this.delaiReconnexionMs = DELAI_INITIAL_RECONNEXION_MS;
        await this.lireFlux(reponse.body);
      } catch {
        // Réseau coupé, flux fermé par le serveur (ex. poste bloqué,
        // voir posteEventBus.ts), redémarrage de l'API... — jamais un
        // crash, jamais une exception qui remonterait : retenté avec
        // l'attente croissante ci-dessous.
      }

      if (this.arrete) return;
      await this.attendre(this.delaiReconnexionMs);
      this.delaiReconnexionMs = Math.min(this.delaiReconnexionMs * 2, DELAI_MAX_RECONNEXION_MS);
    }
  }

  /** Découpe le flux SSE en trames séparées par une ligne vide — une ligne "data:" déclenche le signal, un commentaire (":...", battement de cœur) est ignoré. */
  private async lireFlux(body: ReadableStream<Uint8Array>): Promise<void> {
    const lecteur = body.getReader();
    const decodeur = new TextDecoder();
    let tampon = "";
    try {
      for (;;) {
        if (this.arrete) return;
        const { done, value } = await lecteur.read();
        if (done) return;
        tampon += decodeur.decode(value, { stream: true });
        const trames = tampon.split("\n\n");
        tampon = trames.pop() ?? "";
        for (const trame of trames) {
          if (trame.startsWith("data:")) this.onSignal();
        }
      }
    } finally {
      await lecteur.cancel().catch(() => {});
    }
  }

  private attendre(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
