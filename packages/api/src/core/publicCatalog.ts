import { pricing as domainPricing } from "@maxi-equip/domain";
import {
  listerModelesActifs,
  listerProduitsActifs,
  listerImagesActives,
  listerPromotionsActives,
  type ProduitRow,
} from "./catalogStore.js";

/**
 * Construction des DTO publics du catalogue — correction "Intégration
 * Site Phase 5, Partie 3 (site réel)".
 *
 * Ces types reproduisent EXACTEMENT la forme attendue par le site
 * (`packages/site/src/lib/types/catalog.ts`) : aucune modification des
 * composants/pages du site n'est nécessaire, seul `ApiCatalogRepository`
 * consomme ce module. Le calcul du prix après réduction réutilise
 * `@maxi-equip/domain` (`calculerPrixApresReduction`) — jamais une
 * seconde implémentation de cette règle métier côté API.
 *
 * GARANTIE STRUCTURELLE (pas seulement un filtre applicatif) : aucun des
 * champs lus depuis `catalogStore.ts` ne contient de stock, de seuil
 * d'alerte, de fournisseur ou de coût d'achat — ces colonnes n'existent
 * dans AUCUNE des tables de projection catalogue.
 */

export interface PublicProductImage {
  id: string;
  url: string;
  alt: string;
  order: number;
}

export interface PublicProductVariant {
  id: string;
  size: string;
  reference: string;
  priceFcfa: number;
}

export interface PublicProductModel {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string;
  images: PublicProductImage[];
  variants: PublicProductVariant[];
  updatedAt: string;
  featured?: boolean;
  /** Position d'affichage dans la vitrine de l'accueil (null = non sélectionné) — voir ModeleRepository.definirVitrine côté app. */
  ordreVitrine: number | null;
}

export interface PublicPromotion {
  id: string;
  productModelId: string;
  variantId?: string;
  promoPriceFcfa: number;
  startsAt: string;
  endsAt: string;
}

function grouperParModele<T extends { modeleId: string }>(lignes: T[]): Map<string, T[]> {
  const carte = new Map<string, T[]>();
  for (const ligne of lignes) {
    const liste = carte.get(ligne.modeleId) ?? [];
    liste.push(ligne);
    carte.set(ligne.modeleId, liste);
  }
  return carte;
}

/** Un modèle actif sans variante active n'a aucun prix affichable — jamais présenté sur le site public (cohérent avec "à partir de X FCFA", impossible à calculer sans variante). */
export async function construireModelesPublics(): Promise<PublicProductModel[]> {
  const [modeles, produitsActifs, imagesActives, promotions] = await Promise.all([
    listerModelesActifs(),
    listerProduitsActifs(),
    listerImagesActives(),
    listerPromotionsActives(),
  ]);
  const produitsParModele = grouperParModele(produitsActifs);
  const imagesParModele = grouperParModele(imagesActives);
  const maintenant = new Date().toISOString();

  const produitIdsEnPromoActive = new Set<string>();
  for (const promo of promotions) {
    if (promo.dateDebut > maintenant || promo.dateFin < maintenant) continue;
    if (promo.perimetre === "global") {
      for (const p of produitsActifs) produitIdsEnPromoActive.add(p.id);
    } else {
      for (const id of promo.produitIds) produitIdsEnPromoActive.add(id);
    }
  }

  return modeles
    .map((m) => {
      const variantes = produitsParModele.get(m.id) ?? [];
      const images = (imagesParModele.get(m.id) ?? []).map((img, index) => ({
        id: img.id,
        url: img.url!,
        alt: m.motif,
        order: index,
      }));
      return {
        id: m.id,
        slug: m.slug,
        name: m.motif,
        type: m.type,
        // Aucune description réelle n'existe encore dans le domaine
        // métier (ModeleProduit n'a pas ce champ, aucun écran de saisie
        // n'existe côté Electron) — chaîne vide plutôt qu'une valeur
        // inventée, jamais `null` (contrat du type ProductModel).
        description: "",
        images,
        variants: variantes.map((v) => ({ id: v.id, size: v.taille, reference: v.reference, priceFcfa: v.prix })),
        updatedAt: m.updatedAt,
        featured: variantes.some((v) => produitIdsEnPromoActive.has(v.id)),
        ordreVitrine: m.ordreVitrine,
      };
    })
    .filter((m) => m.variants.length > 0);
}

/**
 * Fanout des promotions réelles (pourcentage/montant fixe, globale/
 * ciblée) vers la forme simplifiée déjà attendue par le site (un prix
 * promotionnel déjà résolu par variante). Inclut TOUTES les promotions
 * connues, pas seulement celles actives maintenant — le filtrage par
 * date reste une responsabilité du site (`lib/pricing.ts`,
 * `isValidPromotion`), exactement comme pour les données mockées
 * d'origine (expirée/future/active toutes présentes).
 */
export async function construirePromotionsPubliques(): Promise<PublicPromotion[]> {
  const [promotions, produits] = await Promise.all([listerPromotionsActives(), listerProduitsActifs()]);
  const produitById = new Map(produits.map((p) => [p.id, p]));

  const resultat: PublicPromotion[] = [];
  for (const promo of promotions) {
    const cibles: ProduitRow[] =
      promo.perimetre === "global" ? produits : (promo.produitIds.map((id) => produitById.get(id)).filter((p): p is ProduitRow => Boolean(p)));

    for (const variante of cibles) {
      let promoPriceFcfa: number;
      try {
        domainPricing.assertValidPromotion({
          typeReduction: promo.typeReduction,
          valeur: promo.valeur,
          dateDebut: promo.dateDebut,
          dateFin: promo.dateFin,
        });
        promoPriceFcfa = domainPricing.calculerPrixApresReduction(variante.prix, promo.typeReduction, promo.valeur);
      } catch {
        // Donnée de promotion incohérente (ne devrait jamais arriver,
        // déjà validée à l'entrée) — jamais faire échouer tout
        // l'endpoint public pour une seule ligne suspecte.
        continue;
      }
      resultat.push({
        id: `${promo.id}:${variante.id}`,
        productModelId: variante.modeleId,
        variantId: variante.id,
        promoPriceFcfa,
        startsAt: promo.dateDebut,
        endsAt: promo.dateFin,
      });
    }
  }
  return resultat;
}
