import type {
  OrderRequestInput,
  OrderRequestResult,
} from "@/lib/types/request";
import type { RequestRepository } from "./RequestRepository";

/**
 * Implémentation réelle — correction "Intégration Site Phase 5".
 * Appelle le vrai point d'entrée public construit côté API MAXI-EQUIP
 * (`POST /v1/public/requests`), jamais authentifié par un JWT
 * d'installation (qui ne doit jamais quitter le processus principal de
 * l'application MAXI-EQUIP). Le honeypot est transmis tel quel — la
 * décision de l'ignorer reste entièrement une responsabilité serveur,
 * jamais cliente (déjà géré côté API : réponse 200 identique qu'il soit
 * déclenché ou non, jamais un indice donné à un robot).
 *
 * La limitation de fréquence (429) et la validation stricte sont
 * gérées côté serveur ; ce client se contente de relayer un message
 * d'erreur clair à l'utilisateur dans ces deux cas.
 *
 * Correction "Intégration Site Phase 5, §6" : "Ne jamais afficher une
 * erreur technique brute." Un échec RÉSEAU (API injoignable, coupure,
 * DNS...) produit un message d'erreur JavaScript brut (ex. "Failed to
 * fetch"), et une réponse serveur sans corps JSON exploitable n'a qu'un
 * code HTTP à offrir — ni l'un ni l'autre n'est jamais montré tel quel.
 * Seul un message déjà propre RENVOYÉ PAR L'API (validation, limitation
 * de fréquence) est affiché sans modification.
 */
export const MESSAGE_SERVICE_INDISPONIBLE =
  "Le service de demande est momentanément indisponible. Veuillez réessayer dans quelques instants.";

export class ApiRequestRepository implements RequestRepository {
  constructor(private readonly baseUrl: string) {}

  async submit(input: OrderRequestInput): Promise<OrderRequestResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/public/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error(MESSAGE_SERVICE_INDISPONIBLE);
    }

    if (res.status === 429) {
      const message = await this.lireMessageErreur(res);
      throw new Error(message ?? "Trop de demandes envoyées récemment. Merci de réessayer dans quelques minutes.");
    }
    if (!res.ok) {
      const message = await this.lireMessageErreur(res);
      throw new Error(message ?? MESSAGE_SERVICE_INDISPONIBLE);
    }

    return (await res.json()) as OrderRequestResult;
  }

  /**
   * BUG RÉEL CORRIGÉ (Phase 5, tests réels) : l'implémentation
   * précédente lisait `corps.message` à la racine du corps JSON, alors
   * que le contrat RÉEL de l'API (`errorToResponse`, voir
   * packages/api/src/core/errors.ts) renvoie toujours
   * `{ error: { code, message } }` — le message n'était donc jamais
   * réellement extrait, silencieusement remplacé par le message
   * générique de secours dans TOUS les cas d'erreur serveur, jamais
   * détecté faute de test contre la forme réelle de l'API.
   */
  private async lireMessageErreur(res: Response): Promise<string | null> {
    const corps = (await res.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
    return corps?.error?.message ?? corps?.message ?? null;
  }
}
