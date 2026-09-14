/**
 * Ordonnancement numérique des tailles de carreaux.
 *
 * Les tailles sont stockées en texte libre ("60x60", "30x60"…) car la saisie
 * reste libre côté gestion (cahier des charges §3). Un tri alphabétique sur
 * ce texte est incorrect ("30x30" > "80x80" lexicographiquement à cause du
 * "8" < "3"? en réalité l'inverse, mais le point général reste : "40x40"
 * viendrait avant "60x60" par hasard, alors que "100x100" se classerait
 * AVANT "60x60" lexicographiquement, ce qui est faux numériquement).
 *
 * `sizeSortValue` extrait une valeur numérique triable (la surface,
 * largeur × hauteur) à partir du texte. Utilisé pour :
 *  - le tri par défaut du catalogue ("Type et taille", voir pricing/sort) ;
 *  - la liste des tailles disponibles dans le filtre du catalogue.
 */
export function sizeSortValue(size: string): number {
  const match = size.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) {
    // Taille non reconnue (format inattendu) : on la relègue en fin de liste
    // plutôt que de faire échouer le tri.
    return Number.POSITIVE_INFINITY;
  }
  // Les deux groupes sont obligatoires dans le motif ci-dessus : si `match`
  // existe, ils existent forcément. Non-null assertion nécessaire ici
  // uniquement à cause de `noUncheckedIndexedAccess`, jamais une vraie
  // incertitude d'exécution.
  const width = parseFloat(match[1]!.replace(",", "."));
  const height = parseFloat(match[2]!.replace(",", "."));
  if (Number.isNaN(width) || Number.isNaN(height)) {
    return Number.POSITIVE_INFINITY;
  }
  return width * height;
}

/** Valeur de tri de la plus petite taille disponible parmi une liste de variantes. */
export function smallestVariantSizeValue(variants: { size: string }[]): number {
  if (variants.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...variants.map((v) => sizeSortValue(v.size)));
}

/** Comparateur prêt à l'emploi pour `Array.prototype.sort`, tailles croissantes. */
export function compareSizes(a: string, b: string): number {
  return sizeSortValue(a) - sizeSortValue(b);
}
