import type { ISODateTime, Produit, Promotion } from "@maxi-equip/shared-types";

export interface EffectivePrice {
  price: number;
  isPromoActive: boolean;
  originalPrice: number;
}

/**
 * Calcule le prix effectif d'un produit à une date donnée.
 *
 * Règle métier (cahier des charges §10, Synthèse §6, Corrections §6/§8) :
 * le prix catalogue du produit n'est JAMAIS modifié par une promotion.
 * Le prix affiché ou appliqué à une vente est toujours RECALCULÉ à partir
 * du prix catalogue et d'une promotion active à la date donnée — jamais
 * stocké en double quelque part.
 *
 * Cette fonction est un exemple délibérément simple pour la Phase 0 :
 * elle prouve que la couche `domain` peut exprimer une règle métier sans
 * aucune dépendance à Electron, SQLite, PostgreSQL ou un framework web.
 * Les autres règles (fusion facture interne/externe, cohérence des
 * transferts, etc.) seront développées en Phase 1.
 *
 * @param produit Le produit dont on veut le prix effectif.
 * @param promotions Les promotions existantes pour CE produit (le tri/filtrage
 *   par produit est laissé à l'appelant, qui a accès au dépôt de données).
 * @param atDate Date de référence (par défaut : maintenant).
 */
export function getEffectivePrice(
  produit: Pick<Produit, "prix">,
  promotions: Pick<Promotion, "prixPromotionnel" | "dateDebut" | "dateFin">[],
  atDate: ISODateTime = new Date().toISOString()
): EffectivePrice {
  const now = new Date(atDate).getTime();

  const active = promotions.find((promo) => {
    const start = new Date(promo.dateDebut).getTime();
    const end = new Date(promo.dateFin).getTime();
    return now >= start && now <= end;
  });

  if (!active) {
    return { price: produit.prix, isPromoActive: false, originalPrice: produit.prix };
  }

  return {
    price: active.prixPromotionnel,
    isPromoActive: true,
    originalPrice: produit.prix,
  };
}
