/**
 * Règles métier de stock — cahier des charges §5, §7, Corrections §4.
 *
 * Principes non négociables :
 * - Une entrée augmente le stock d'un emplacement.
 * - Une sortie (vente) diminue le stock RÉELLEMENT prélevé, jamais plus
 *   que ce qui est disponible.
 * - Un transfert déplace du stock entre deux emplacements — jamais une
 *   vente, jamais de facture, jamais de chiffre d'affaires (§5, §12).
 * - Une vente mixte (stock interne + approvisionnement externe) ne doit
 *   déduire du stock MAXI EQUIP QUE la part interne. La part externe
 *   n'est jamais ajoutée au stock MAXI EQUIP simplement parce qu'elle a
 *   servi à une vente (§7) — elle n'existe que dans le relevé interne
 *   (voir module invoicing).
 * - Application en delta, jamais en valeur absolue (Corrections §4),
 *   pour rester cohérent avec la synchronisation par lots (Phase 3).
 */

export class InsufficientStockError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number
  ) {
    super(`Stock insuffisant : ${requested} demandé(s), ${available} disponible(s).`);
    this.name = "InsufficientStockError";
  }
}

export class InvalidQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQuantityError";
  }
}

function assertPositiveQuantity(quantite: number, label: string): void {
  if (!Number.isFinite(quantite) || quantite <= 0) {
    throw new InvalidQuantityError(`${label} doit être un nombre strictement positif (reçu : ${quantite}).`);
  }
}

/** Résultat d'une opération de stock : le delta à appliquer à un emplacement donné. */
export interface StockDelta {
  emplacementId: string;
  delta: number;
}

/**
 * Entrée de stock. Toujours acceptée (aucune limite haute métier) tant
 * que la quantité est strictement positive.
 */
export function applyEntree(emplacementId: string, quantite: number): StockDelta {
  assertPositiveQuantity(quantite, "La quantité d'entrée");
  return { emplacementId, delta: quantite };
}

/**
 * Sortie de stock (ex. vente de la part interne). Vérifie que la
 * quantité demandée ne dépasse jamais le stock disponible à cet
 * emplacement — lève InsufficientStockError sinon, jamais un stock négatif.
 */
export function applySortie(emplacementId: string, quantiteDisponible: number, quantiteDemandee: number): StockDelta {
  assertPositiveQuantity(quantiteDemandee, "La quantité de sortie");
  if (quantiteDemandee > quantiteDisponible) {
    throw new InsufficientStockError(quantiteDisponible, quantiteDemandee);
  }
  return { emplacementId, delta: -quantiteDemandee };
}

/**
 * Transfert entre deux emplacements. Retourne les deux deltas à
 * appliquer (source négatif, destination positif). Jamais traité comme
 * une vente : aucun lien vers une facture, aucun chiffre d'affaires.
 */
export function applyTransfert(
  emplacementSourceId: string,
  emplacementDestinationId: string,
  quantiteDisponibleSource: number,
  quantite: number
): [StockDelta, StockDelta] {
  assertPositiveQuantity(quantite, "La quantité de transfert");
  if (emplacementSourceId === emplacementDestinationId) {
    throw new InvalidQuantityError("L'emplacement source et l'emplacement destination doivent être différents.");
  }
  if (quantite > quantiteDisponibleSource) {
    throw new InsufficientStockError(quantiteDisponibleSource, quantite);
  }
  return [
    { emplacementId: emplacementSourceId, delta: -quantite },
    { emplacementId: emplacementDestinationId, delta: quantite },
  ];
}

/**
 * Répartition d'une ligne de vente entre stock interne et
 * approvisionnement externe (§7). Le total demandé par le client est
 * couvert en priorité par le stock disponible ; le reste est externe.
 *
 * RÈGLE CRITIQUE : la quantité externe n'est JAMAIS ajoutée au stock —
 * cette fonction ne retourne un StockDelta QUE pour la part interne.
 * La part externe est uniquement destinée au relevé interne
 * d'approvisionnement (module invoicing), jamais au stock.
 */
export interface RepartitionVente {
  quantiteInterne: number;
  quantiteExterne: number;
  /** Delta à appliquer au stock MAXI EQUIP — null si aucune part interne. */
  stockDelta: StockDelta | null;
}

export function repartirVenteInterneExterne(
  emplacementId: string,
  quantiteDisponible: number,
  quantiteDemandee: number
): RepartitionVente {
  assertPositiveQuantity(quantiteDemandee, "La quantité demandée");
  const quantiteInterne = Math.min(quantiteDisponible, quantiteDemandee);
  const quantiteExterne = quantiteDemandee - quantiteInterne;

  return {
    quantiteInterne,
    quantiteExterne,
    stockDelta: quantiteInterne > 0 ? { emplacementId, delta: -quantiteInterne } : null,
  };
}
