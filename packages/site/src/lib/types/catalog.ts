/**
 * Types du catalogue public.
 *
 * Ces types reflètent les entités "Catalogue" et "Promotions" décrites dans la
 * Synthèse d'architecture (étape 6 — Principales entités du modèle) :
 * Produit, Image produit, Emplacement, Promotion. Ils sont volontairement
 * limités aux champs que le site est autorisé à lire (cf. tableau
 * "Application Windows (authentifiée) / Site vitrine (public)" de la
 * Synthèse : le site ne reçoit jamais le stock réel).
 *
 * Quand le vrai package @maxi-equip/shared-types sera fourni, ces types
 * devront être remplacés par un import de ce package plutôt que redéfinis ici.
 */

/** Type libre de carreau (faïence, grès cérame, antidérapant, mosaïque…) — saisie libre côté gestion, donc liste ouverte ici aussi (cahier des charges §3). */
export type TileType = string;

export interface ProductImage {
  id: string;
  /** URL relative ou absolue de l'image. En Phase 5, pointe vers /images/products (mock). */
  url: string;
  alt: string;
  /** Position dans la galerie ; 0 = image principale. */
  order: number;
}

/** Une taille disponible pour un modèle/motif donné, avec son propre prix et sa propre référence (cahier des charges §3 : référence, taille, prix par carreau). */
export interface ProductVariant {
  id: string;
  /** Ex. "60x60", "30x60" — la taille reste une information principale et bien visible (cahier des charges §3). */
  size: string;
  reference: string;
  /** Prix catalogue, en FCFA, hors promotion. */
  priceFcfa: number;
}

/** Un modèle/motif de carreau, regroupant toutes ses tailles disponibles (cahier des charges §9 : regroupement par modèle/motif, choix de la taille). */
export interface ProductModel {
  id: string;
  slug: string;
  /** Nom du motif — doit toujours être accompagné d'une image, jamais affiché seul comme représentation du produit (consigne explicite de la phase). */
  name: string;
  type: TileType;
  description: string;
  images: ProductImage[];
  variants: ProductVariant[];
  /** Date de création/dernière modification, pour le tri par date (Corrections d'architecture, point 18). */
  updatedAt: string;
  /** Mise en avant sur l'accueil. Ne reflète jamais un niveau de stock. */
  featured?: boolean;
  /**
   * Position d'affichage dans la vitrine de la page d'accueil, choisie
   * manuellement depuis l'app (0 = premier) — `null` = non sélectionné.
   * Distinct de `featured` ci-dessus (qui reflète en réalité une
   * promotion active, jamais une vraie curation manuelle) — correction
   * "choisir quels carreaux s'affichent en première page" (2026-10-07).
   */
  ordreVitrine: number | null;
}

export interface Promotion {
  id: string;
  productModelId: string;
  /** Optionnel : promotion limitée à une taille précise. Si absent, s'applique à toutes les tailles du modèle. */
  variantId?: string;
  promoPriceFcfa: number;
  startsAt: string;
  endsAt: string;
}

/** Emplacement MAXI EQUIP. SHOP est le point de vente ; Akébé/Akanda sont des dépôts, jamais présentés comme lieux d'achat (cahier des charges §1, Synthèse étape 4). */
export interface CompanyLocation {
  id: string;
  name: string;
  kind: "point_de_vente" | "depot";
  address: string;
  city: string;
  mapUrl?: string;
  hours?: string;
}

/** Vue "produit à l'affichage prix", après application d'une promotion éventuelle. Le prix catalogue reste toujours distinct du prix promotionnel (cahier des charges §10). */
export interface EffectivePrice {
  normalPriceFcfa: number;
  promoPriceFcfa: number | null;
  isPromotionActive: boolean;
  /** Pourcentage de réduction arrondi à l'entier le plus proche (ex. 17 pour "-17 %"), ou `null` si aucune promotion active. Calculé une seule fois dans `getEffectivePrice` pour éviter de dupliquer le calcul dans les composants. */
  discountPercent: number | null;
}
