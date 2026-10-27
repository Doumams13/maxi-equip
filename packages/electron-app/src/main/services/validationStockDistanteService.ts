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

/**
 * Compense un échec LOCAL survenu APRÈS une validation distante déjà
 * réussie — correction "vente décrémentée sans facture générée"
 * (2026-10-27). `valider()` ci-dessous COMMIT immédiatement côté serveur
 * (stock_central modifié, éventuellement un numéro de facture consommé) ;
 * si la transaction SQLite locale qui suit échoue pour QUELQUE RAISON
 * QUE CE SOIT (FK manquante, erreur disque, validation métier échouant
 * tardivement...), ce commit serveur n'était jusqu'ici JAMAIS annulé —
 * le stock central restait décrémenté alors qu'aucune facture/mouvement
 * local n'existe, un écart permanent et invisible jusqu'au prochain
 * rattrapage (voir SyncService).
 *
 * Renvoie exactement l'inverse des deltas déjà appliqués (addition ⇄
 * soustraction se neutralisent, sûr sous concurrence — jamais une valeur
 * absolue qui écraserait une modification faite entre-temps par un autre
 * poste). Best-effort : si la compensation elle-même échoue (ex. perte
 * de connexion au pire moment), l'écart persiste jusqu'au prochain
 * rattrapage périodique — journalisé, jamais silencieux, mais ne doit
 * jamais masquer l'erreur locale d'origine (toujours relancée par
 * l'appelant après cet appel).
 */
export async function compenserApresEchecLocal(
  service: ValidationStockDistanteService,
  deltasDejaAppliques: { produitId: string; emplacementId: string; delta: number }[]
): Promise<void> {
  if (deltasDejaAppliques.length === 0) return;
  try {
    const resultat = await service.valider(deltasDejaAppliques.map((d) => ({ ...d, delta: -d.delta })));
    if (!resultat.success) {
      // eslint-disable-next-line no-console
      console.error("[stock] compensation refusée par le serveur après échec local :", resultat);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stock] compensation du stock distant après échec local impossible :", err instanceof Error ? err.message : err);
  }
}

/** Traduit un échec de validation distante en l'exception appropriée — stock réellement insuffisant (même type d'erreur domaine qu'une vérification locale, voir mapStockError) ou connexion requise (hors-ligne/serveur en erreur). */
export function erreurDepuisEchecValidationDistante(resultat: Extract<ResultatValidationStockDistante, { success: false }>): Error {
  if (resultat.raison === "stock_insuffisant") {
    const premier = resultat.details[0]!;
    return new domainStock.InsufficientStockError(premier.disponible, premier.demande);
  }
  return new ConnexionRequiseError(resultat.message);
}

export type ResultatInitialisationStock =
  | { success: true; lignesAppliquees: number }
  | { success: false; message: string };

export type ResultatLectureStockCentral =
  | { success: true; lignes: { produitId: string; emplacementId: string; quantite: number }[] }
  | { success: false; message: string };

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

  /**
   * Amorçage ponctuel de `stock_central` — correction "pc annexe ne peut
   * pas vendre malgré le stock réel" (2026-10-27). `stock_central` part
   * toujours de 0 et n'est alimentée QUE par des opérations déjà validées
   * en ligne : un poste qui vendait encore uniquement en local avant
   * d'activer la validation distante n'y a jamais rien inscrit, donc son
   * stock réel — pourtant bien réel — y est invisible pour tout autre
   * poste qui, lui, valide déjà en ligne.
   *
   * Fixe une quantité ABSOLUE pour chaque ligne (jamais un delta,
   * contrairement à `valider()` ci-dessus) — destinée à être appelée UNE
   * SEULE FOIS, depuis le poste qui détient le vrai stock à jour (voir
   * `StockRepository.listTout()`). Un appel ultérieur REMPLACE la
   * quantité précédente, jamais ne la cumule.
   */
  async initialiserStockCentral(lignes: { produitId: string; emplacementId: string; quantite: number }[]): Promise<ResultatInitialisationStock> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/operations/initialiser-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ lignes }),
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as { lignesAppliquees: number };
      return { success: true, lignesAppliquees: corps.lignesAppliquees };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }

  /**
   * Rattrapage périodique du stock partagé — correction "vente sur un
   * poste annexe non répercutée sur le PC Shop après 10+ minutes"
   * (2026-10-27). `stock_central` est déjà la source de vérité pour
   * TOUTE opération de stock (vente/annulation/entrée/sortie/transfert —
   * voir VenteService/StockService, qui y écrivent toutes via
   * `valider()` ci-dessus), mais jusqu'ici rien ne la relisait jamais :
   * un poste ne rafraîchissait sa copie locale d'un produit que
   * lorsqu'IL réalisait lui-même une opération sur ce produit. Appelée à
   * chaque cycle de synchronisation (voir SyncService), sur TOUS les
   * postes (Shop et annexes confondus) — jamais un sens privilégié.
   */
  async recupererStockCentral(): Promise<ResultatLectureStockCentral> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/operations/stock`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });

      if (!reponse.ok) {
        return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as { lignes: { produitId: string; emplacementId: string; quantite: number }[] };
      return { success: true, lignes: corps.lignes };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
