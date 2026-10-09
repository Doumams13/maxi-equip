/**
 * Conversion prix/m² ↔ prix/carton — correction "le prix de référence est
 * au m², mais ce qui se vend c'est le carton" (2026-10-08). Le nombre de
 * carreaux par carton varie selon la taille (ex. 4 pour un 60×60, 12 pour
 * un 40×40) et ne suit aucune formule universelle — c'est une donnée
 * saisie par taille/référence, jamais déduite.
 *
 * Toutes les dimensions d'entrée (largeur/hauteur) sont en CENTIMÈTRES,
 * cohérent avec `Produit.largeur`/`Produit.hauteur` (shared-types) — la
 * conversion en m² se fait ici, jamais ailleurs.
 */

/** Surface d'un seul carreau, en m², à partir de ses dimensions en cm. */
export function calculerSurfaceCarreauM2(largeurCm: number, hauteurCm: number): number {
  return (largeurCm / 100) * (hauteurCm / 100);
}

/** Surface totale d'un carton, en m² — carreauxParCarton × surface d'un carreau. */
export function calculerSurfaceCartonM2(carreauxParCarton: number, largeurCm: number, hauteurCm: number): number {
  return carreauxParCarton * calculerSurfaceCarreauM2(largeurCm, hauteurCm);
}

/**
 * Prix du carton à partir d'un prix au m² et de la surface du carton —
 * arrondi au FCFA le plus proche, jamais de décimales (convention déjà
 * appliquée partout ailleurs sur les montants FCFA de ce projet, voir
 * calculerPrixApresReduction).
 */
export function calculerPrixCartonDepuisPrixM2(prixM2: number, surfaceCartonM2: number): number {
  return Math.round(prixM2 * surfaceCartonM2);
}

/** Prix au m² à partir d'un prix de carton et de la surface du carton — même convention d'arrondi. */
export function calculerPrixM2DepuisPrixCarton(prixCarton: number, surfaceCartonM2: number): number {
  return Math.round(prixCarton / surfaceCartonM2);
}
