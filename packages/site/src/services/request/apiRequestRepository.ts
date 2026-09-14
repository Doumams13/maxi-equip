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
 */
export class ApiRequestRepository implements RequestRepository {
  constructor(private readonly baseUrl: string) {}

  async submit(input: OrderRequestInput): Promise<OrderRequestResult> {
    const res = await fetch(`${this.baseUrl}/v1/public/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (res.status === 429) {
      const corps = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(corps?.message ?? "Trop de demandes envoyées récemment. Merci de réessayer dans quelques minutes.");
    }
    if (!res.ok) {
      const corps = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(corps?.message ?? `Échec de l'envoi de la demande (${res.status}).`);
    }

    return (await res.json()) as OrderRequestResult;
  }
}
