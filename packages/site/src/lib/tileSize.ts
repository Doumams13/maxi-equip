/**
 * Tri numérique des tailles de carreaux.
 *
 * Les tailles sont stockées en texte libre (ex. "30x30", "40x40", "60x60" —
 * voir `ProductVariant.size` dans `src/lib/types/catalog.ts`, saisie libre
 * côté gestion). Un tri alphabétique classerait "40x40" avant "60x60" mais
 * aussi, par exemple, "100x100" avant "60x60" (ordre lexicographique
 * incorrect). Ce module isole donc un tri NUMÉRIQUE, réutilisable partout où
 * un classement par taille est nécessaire (catalogue trié "Type et taille",
 * et potentiellement d'autres tris futurs), pour ne pas dupliquer cette
 * logique de parsing dans plusieurs endroits.
 */

/**
 * Convertit une taille "LxH" (ex. "60x60", "30x60") en une valeur numérique
 * triable : la surface (largeur × hauteur). Deux carreaux carrés se classent
 * alors naturellement dans l'ordre attendu (30x30 < 40x40 < 60x60 < 80x80),
 * et une taille rectangulaire se situe de façon cohérente par rapport aux
 * tailles carrées environnantes.
 *
 * Si le format n'est pas reconnu (une seule dimension, texte libre inattendu),
 * on retombe sur le premier nombre trouvé, puis, en dernier recours, sur
 * `+Infinity` pour que la valeur soit classée à la fin plutôt que de faire
 * échouer le tri.
 */
export function parseSizeToSortValue(size: string): number {
  const pair = size.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (pair && pair[1] !== undefined && pair[2] !== undefined) {
    const width = parseFloat(pair[1].replace(",", "."));
    const height = parseFloat(pair[2].replace(",", "."));
    if (!Number.isNaN(width) && !Number.isNaN(height)) {
      return width * height;
    }
  }

  const single = size.match(/(\d+(?:[.,]\d+)?)/);
  if (single && single[1] !== undefined) {
    const value = parseFloat(single[1].replace(",", "."));
    if (!Number.isNaN(value)) return value;
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * Plus petite taille disponible parmi les variantes d'un modèle — utilisée
 * comme critère de tri secondaire pour le classement "Type et taille"
 * (un modèle regroupant plusieurs tailles est positionné selon sa taille la
 * plus petite, tout en conservant toutes ses variantes sur sa carte).
 */
export function getSmallestVariantSortValue(variants: { size: string }[]): number {
  if (variants.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...variants.map((v) => parseSizeToSortValue(v.size)));
}
