import type { UniteVente } from "@maxi-equip/shared-types";
import { uniteVenteEffective } from "@maxi-equip/shared-types";

/**
 * Bilan par catégorie (point 5 de la liste du 2026-11-23, "version
 * complète" validée le 2026-11-24) — logique PURE (aucun accès base),
 * testée séparément : filtre catégorie/sous-catégorie et ventilation des
 * ventes par catégorie. Les données brutes viennent des dépôts
 * (ProduitRepository.classementCatalogue, FactureRepository.lignesVenduesEntre),
 * l'assemblage final est fait par `calculerBilan` (ipc/metier.ts).
 */
export const LIBELLE_NON_CLASSE = "Non classé";

export interface FiltreBilan {
  categorieId?: string | null;
  sousCategorieId?: string | null;
}

export interface ClassementProduit {
  produitId: string;
  categorieId: string | null;
  categorieNom: string | null;
  sousCategorieId: string | null;
  sousCategorieNom: string | null;
  estCarreau: boolean;
}

export interface LigneVendue {
  factureId: string;
  produitId: string | null;
  quantite: number;
  prixUnitaire: number;
  uniteVente: string | null;
  reference: string | null;
  motif: string;
  taille: string;
}

export interface VentesCategorie {
  categorieId: string | null;
  categorieNom: string;
  /** Montant facturé des lignes (quantité × prix unitaire), avant la remise de la facture. */
  chiffreAffaires: number;
  /** Quantités vendues ventilées par unité — jamais une somme mélangeant cartons et sacs. */
  quantites: { unite: UniteVente; quantite: number }[];
  /** Part du chiffre d'affaires de la période (0 à 1). */
  part: number;
}

export function filtreEstActif(filtre: FiltreBilan | null | undefined): boolean {
  return !!(filtre && (filtre.categorieId || filtre.sousCategorieId));
}

/** Un produit sans classement ne correspond qu'à l'absence de filtre. */
export function produitCorrespondAuFiltre(classement: ClassementProduit | undefined, filtre: FiltreBilan | null | undefined): boolean {
  if (!filtreEstActif(filtre)) return true;
  if (!classement) return false;
  if (filtre!.sousCategorieId) return classement.sousCategorieId === filtre!.sousCategorieId;
  return classement.categorieId === filtre!.categorieId;
}

export function unite(u: string | null | undefined): UniteVente {
  return uniteVenteEffective({ uniteVente: (u as UniteVente | null | undefined) ?? null });
}

export function ventesParCategorie(lignes: LigneVendue[], classementParProduit: Map<string, ClassementProduit>): VentesCategorie[] {
  const groupes = new Map<string, { categorieId: string | null; categorieNom: string; chiffreAffaires: number; quantites: Map<UniteVente, number> }>();
  let total = 0;
  for (const l of lignes) {
    const c = l.produitId ? classementParProduit.get(l.produitId) : undefined;
    const cle = c?.categorieId ?? "__non_classe__";
    const g = groupes.get(cle) ?? { categorieId: c?.categorieId ?? null, categorieNom: c?.categorieNom ?? LIBELLE_NON_CLASSE, chiffreAffaires: 0, quantites: new Map() };
    const montant = Math.round(l.quantite * l.prixUnitaire);
    g.chiffreAffaires += montant;
    total += montant;
    const u = unite(l.uniteVente);
    g.quantites.set(u, (g.quantites.get(u) ?? 0) + l.quantite);
    groupes.set(cle, g);
  }
  return [...groupes.values()]
    .map((g) => ({
      categorieId: g.categorieId,
      categorieNom: g.categorieNom,
      chiffreAffaires: g.chiffreAffaires,
      quantites: [...g.quantites.entries()].map(([u, quantite]) => ({ unite: u, quantite })).sort((a, b) => a.unite.localeCompare(b.unite)),
      part: total > 0 ? g.chiffreAffaires / total : 0,
    }))
    .sort((a, b) => b.chiffreAffaires - a.chiffreAffaires);
}

/** Ventilation par unité à partir de quantités par produit (même forme que les agrégats SQL du bilan non filtré). */
export function ventilerParUnite(quantitesParProduit: Iterable<[string, number]>, uniteParProduit: Map<string, UniteVente>): { unite: UniteVente; quantite: number }[] {
  const parUnite = new Map<UniteVente, number>();
  for (const [produitId, quantite] of quantitesParProduit) {
    if (!quantite) continue;
    const u = uniteParProduit.get(produitId) ?? "carton";
    parUnite.set(u, (parUnite.get(u) ?? 0) + quantite);
  }
  return [...parUnite.entries()].map(([u, quantite]) => ({ unite: u, quantite })).sort((a, b) => a.unite.localeCompare(b.unite));
}

/** Produits les plus vendus à partir des lignes (même libellé que FactureRepository.topProduitsVendusEntre). */
export function topProduitsDepuisLignes(lignes: LigneVendue[], limite: number): { label: string; quantite: number }[] {
  const parLibelle = new Map<string, number>();
  for (const l of lignes) {
    const label = l.reference ?? `${l.motif} — ${l.taille}`;
    parLibelle.set(label, (parLibelle.get(label) ?? 0) + l.quantite);
  }
  return [...parLibelle.entries()]
    .map(([label, quantite]) => ({ label, quantite }))
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, limite);
}
