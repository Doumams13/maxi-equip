import { stock as domainStock } from "@maxi-equip/domain";
import { getConfigurationSync } from "./syncConfig.js";

/** Levée quand une opération de stock ne peut pas être validée en ligne (hors-ligne, serveur injoignable ou en erreur) alors que la synchronisation est configurée — reconnue par `mapStockError` (voir ipc/metier.ts), jamais confondue avec un stock réellement insuffisant. */
export class ConnexionRequiseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnexionRequiseError";
  }
}

/**
 * Validation en ligne du stock partagé — correction "travailler en
 * parallèle sur le même stock" (2026-10-22). Dès que la synchronisation
 * est configurée sur ce poste, AUCUNE vente ni mouvement de stock
 * (entrée/sortie/transfert) ne doit se baser sur le stock local pour
 * décider s'il est suffisant — décision utilisateur explicite. Ce
 * service appelle le serveur central (`/v1/app/operations/valider`, voir
 * packages/api) qui vérifie et applique l'opération dans UNE transaction
 * avec verrou de ligne — deux postes qui valident en même temps sur le
 * même produit/dépôt sont naturellement sérialisés côté serveur, jamais
 * par une file d'attente applicative ici.
 *
 * Sur un poste où la synchronisation N'EST PAS configurée, ce service
 * n'est JAMAIS appelé (voir `estConfiguree()`, vérifié par
 * VenteService/StockService avant toute tentative) : le comportement
 * reste 100% local et inchangé, exactement comme avant cette correction.
 */

const DELAI_MAX_REQUETE_MS = 15_000;

export interface DeltaStockDemande {
  produitId: string;
  emplacementId: string;
  delta: number;
}

export type ResultatValidationStockDistante =
  | { success: true; numero?: string; stockApres: { produitId: string; emplacementId: string; quantite: number }[] }
  | { success: false; raison: "stock_insuffisant"; details: { produitId: string; emplacementId: string; disponible: number; demande: number }[] }
  | { success: false; raison: "hors_ligne" | "erreur_serveur"; message: string };

/** Traduit un échec de validation distante en l'exception appropriée — stock réellement insuffisant (même type d'erreur domaine qu'une vérification locale, voir mapStockError) ou connexion requise (hors-ligne/serveur en erreur). */
export function erreurDepuisEchecValidationDistante(resultat: Extract<ResultatValidationStockDistante, { success: false }>): Error {
  if (resultat.raison === "stock_insuffisant") {
    const premier = resultat.details[0]!;
    return new domainStock.InsufficientStockError(premier.disponible, premier.demande);
  }
  return new ConnexionRequiseError(resultat.message);
}

export class ValidationStockDistanteService {
  /** Vrai dès que la synchronisation (URL + jeton) est configurée sur ce poste — jamais basé sur un état réseau instantané (qui ne se sait qu'en tentant réellement l'appel). */
  estConfiguree(): boolean {
    return getConfigurationSync().jwt !== null;
  }

  async valider(deltas: DeltaStockDemande[], demandeNumeroFacture?: { prefix: string }): Promise<ResultatValidationStockDistante> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      // Filet de sécurité — les appelants vérifient déjà estConfiguree()
      // avant d'en arriver là ; jamais atteint en pratique.
      return { success: false, raison: "hors_ligne", message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/operations/valider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ deltas, demandeNumeroFacture }),
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, raison: "erreur_serveur", message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as
        | { success: true; numero?: string; stockApres: { produitId: string; emplacementId: string; quantite: number }[] }
        | { success: false; raison: "stock_insuffisant"; details: { produitId: string; emplacementId: string; disponible: number; demande: number }[] };

      if (!corps.success) {
        return { success: false, raison: "stock_insuffisant", details: corps.details };
      }
      return { success: true, numero: corps.numero, stockApres: corps.stockApres };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, raison: "hors_ligne", message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
