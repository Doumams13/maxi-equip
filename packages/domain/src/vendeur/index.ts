/**
 * Règle métier d'attribution du vendeur — Synthèse §9, Corrections §7.
 *
 * Par défaut, le vendeur associé à une vente est le compte actuellement
 * connecté. Un champ optionnel permet de préciser manuellement qui est
 * réellement à l'origine de la vente lorsque ce n'est pas le compte
 * utilisé pour l'enregistrer (ex. l'administrateur enregistre une vente
 * réalisée par le gérant, absent ce jour-là).
 *
 * Cette règle ne dépend d'aucune donnée stockée : elle se contente de
 * déterminer le nom à afficher/imprimer à partir des deux informations
 * disponibles, sans jamais modifier l'identité réelle du compte connecté
 * (utilisateurConnecteId reste la traçabilité technique — §9).
 */

export interface VendeurAttribution {
  /** Nom du compte réellement connecté au moment de la vente. */
  compteConnecteNom: string;
  /** Précision manuelle optionnelle, si la personne diffère du compte connecté. */
  vendeurNomManuel: string | null;
}

export interface VendeurEffectif {
  /** Nom à afficher/imprimer comme vendeur de la vente. */
  nomAffiche: string;
  /** true si le nom affiché provient d'une précision manuelle, false si c'est le compte connecté. */
  estPrecisionManuelle: boolean;
}

/**
 * Détermine le nom de vendeur à retenir pour une vente.
 *
 * - Si aucune précision manuelle n'est renseignée (null ou chaîne vide/
 *   uniquement des espaces) : le compte connecté fait foi.
 * - Sinon, la précision manuelle prévaut pour l'affichage, sans jamais
 *   effacer la traçabilité du compte réellement connecté (qui reste
 *   stockée séparément — voir Facture.vendeurUtilisateurId).
 */
export function resolveVendeurEffectif(attribution: VendeurAttribution): VendeurEffectif {
  const precisionValide = attribution.vendeurNomManuel !== null && attribution.vendeurNomManuel.trim().length > 0;

  if (!precisionValide) {
    return { nomAffiche: attribution.compteConnecteNom, estPrecisionManuelle: false };
  }

  return { nomAffiche: attribution.vendeurNomManuel!.trim(), estPrecisionManuelle: true };
}
