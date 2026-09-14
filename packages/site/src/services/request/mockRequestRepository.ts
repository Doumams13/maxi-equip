import type {
  OrderRequestInput,
  OrderRequestResult,
} from "@/lib/types/request";
import type { RequestRepository } from "./RequestRepository";

function delay<T>(value: T, ms = 700): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Repli si crypto.randomUUID indisponible dans l'environnement d'exécution.
  return `demande-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * Simule la création d'une demande de commande (cahier des charges §8).
 *
 * Ne crée AUCUNE vente, AUCUN paiement, AUCUNE écriture réelle : la demande
 * "réussie" n'existe que dans cette session navigateur, exactement comme
 * demandé pour cette phase ("simuler proprement le succès"). L'intégration
 * réelle enverra ce même objet OrderRequestInput vers l'API centrale
 * (voir apiRequestRepository.ts), qui déclenchera alors une notification
 * dans l'application Windows (cahier des charges §8).
 */
export class MockRequestRepository implements RequestRepository {
  async submit(input: OrderRequestInput): Promise<OrderRequestResult> {
    if (input.websiteHoneypot) {
      // Champ piège rempli : très probablement une soumission automatisée.
      // On ne crée rien, mais on renvoie un succès simulé pour ne pas
      // renseigner un robot sur la détection (comportement anti-spam standard).
      // eslint-disable-next-line no-console
      console.warn(
        "[MockRequestRepository] Soumission ignorée (honeypot rempli) — aucune demande créée."
      );
      return delay({ requestId: generateRequestId(), submittedAt: new Date().toISOString() });
    }

    if (!input.customerName.trim() || !input.phone.trim() || !input.location.trim()) {
      throw new Error(
        "Nom, téléphone et localisation sont obligatoires pour envoyer une demande."
      );
    }
    if (input.lines.length === 0) {
      throw new Error("Le panier est vide : ajoutez au moins un produit avant d'envoyer une demande.");
    }

    return delay({
      requestId: generateRequestId(),
      submittedAt: new Date().toISOString(),
    });
  }
}
