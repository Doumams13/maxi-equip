import type { Promotion } from "@/lib/types/catalog";

/**
 * Promotions mockées.
 *
 * Cahier des charges §10 : "Prix normal, prix promotionnel et période...
 * Les promotions actives sont répercutées sur le site... À la fin de la
 * promotion, le site revient au prix normal." Dans l'architecture réelle, ces
 * données proviennent des paramètres de l'application Windows — ici elles
 * sont isolées et remplaçables (voir src/services/promotionRepository.ts).
 *
 * Le jeu ci-dessous couvre volontairement les trois cas utiles à tester :
 * une promotion active, une expirée, une future.
 */
const now = new Date();
function isoOffsetDays(days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const mockPromotions: Promotion[] = [
  {
    id: "promo-marbre-blanc-active",
    productModelId: "prod-marbre-blanc",
    variantId: "var-marbre-blanc-60x60",
    promoPriceFcfa: 12500,
    startsAt: isoOffsetDays(-10),
    endsAt: isoOffsetDays(10),
  },
  {
    id: "promo-terracotta-active",
    productModelId: "prod-terracotta",
    // Pas de variantId : s'applique à toutes les tailles du modèle.
    promoPriceFcfa: 6200,
    startsAt: isoOffsetDays(-3),
    endsAt: isoOffsetDays(5),
  },
  {
    id: "promo-gres-anthracite-expiree",
    productModelId: "prod-gres-anthracite",
    variantId: "var-gres-anthracite-60x60",
    promoPriceFcfa: 10500,
    startsAt: isoOffsetDays(-40),
    endsAt: isoOffsetDays(-5),
  },
  {
    id: "promo-beige-sable-future",
    productModelId: "prod-beige-sable",
    variantId: "var-beige-sable-60x60",
    promoPriceFcfa: 11900,
    startsAt: isoOffsetDays(7),
    endsAt: isoOffsetDays(20),
  },
];
