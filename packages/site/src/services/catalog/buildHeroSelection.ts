import type { ProductModel } from "@/lib/types/catalog";

/**
 * Sélection finale des modèles affichés dans la mosaïque d'accueil —
 * correction "choisir quels carreaux s'affichent en première page"
 * (2026-10-07). Ne touche NI `Mosaic.tsx` NI `Hero.tsx` : ces deux
 * composants reçoivent simplement le résultat de cette fonction comme
 * `models`, exactement comme ils recevaient auparavant `allModels` —
 * aucun changement de comportement pour eux.
 *
 * RÈGLE (demande explicite : "fais en sorte que tout s'affiche") : les
 * modèles choisis manuellement (`vitrine`, déjà triés par `ordreVitrine`)
 * passent toujours en premier, dans l'ordre choisi. Le reste est complété
 * avec les modèles les plus récents (`recent`) non déjà présents, jusqu'à
 * atteindre `minCount` — jamais une mosaïque à moitié vide si l'admin n'a
 * encore rien sélectionné (ou pas assez). Si `vitrine` est vide, le
 * résultat est identique au tri "récent" seul — comportement par défaut
 * inchangé tant que personne n'a utilisé la nouvelle fonctionnalité.
 */
export function buildHeroSelection(vitrine: ProductModel[], recent: ProductModel[], minCount = 10): ProductModel[] {
  const idsVitrine = new Set(vitrine.map((m) => m.id));
  const complement = recent.filter((m) => !idsVitrine.has(m.id));
  const resultat = [...vitrine];
  for (const modele of complement) {
    if (resultat.length >= minCount) break;
    resultat.push(modele);
  }
  return resultat;
}
