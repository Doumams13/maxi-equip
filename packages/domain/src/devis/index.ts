/**
 * Devis proforma (point 6, 2026-11-24) — calculs partagés entre l'écran
 * Devis (Renderer) et la génération PDF / l'enregistrement (Main), pour
 * qu'il n'existe qu'UNE règle de calcul. Montants en FCFA entiers.
 *
 * Règle de la remise par ligne (modèle proforma fourni) : remise =
 * arrondi(quantité × prix unitaire × % / 100), net = brut − remise.
 * Ex. 10 cartons × 8 415 à 5 % → remise 4 208, net 79 942.
 */
export interface LigneDevisCalculable {
  quantite: number;
  prixUnitaire: number;
  remisePourcent: number;
}

export interface MontantsLigneDevis {
  brut: number;
  remise: number;
  net: number;
}

export function calculerLigneDevis(ligne: LigneDevisCalculable): MontantsLigneDevis {
  const brut = Math.round(ligne.quantite * ligne.prixUnitaire);
  const pourcent = Math.min(100, Math.max(0, Number.isFinite(ligne.remisePourcent) ? ligne.remisePourcent : 0));
  const remise = Math.round((brut * pourcent) / 100);
  return { brut, remise, net: brut - remise };
}

export interface TotauxDevis {
  /** Somme des montants bruts. */
  brut: number;
  /** Somme des remises par ligne. */
  remiseLignes: number;
  /** Remise supplémentaire saisie sur l'ensemble du devis, bornée au net des lignes. */
  remiseGlobale: number;
  /** remiseLignes + remiseGlobale — la valeur reprise telle quelle comme remise de la vente à la conversion. */
  remiseTotale: number;
  net: number;
}

export function calculerTotauxDevis(lignes: LigneDevisCalculable[], remiseGlobale = 0): TotauxDevis {
  let brut = 0;
  let remiseLignes = 0;
  for (const l of lignes) {
    const m = calculerLigneDevis(l);
    brut += m.brut;
    remiseLignes += m.remise;
  }
  const globale = Math.min(Math.max(0, Math.round(remiseGlobale || 0)), brut - remiseLignes);
  const remiseTotale = remiseLignes + globale;
  return { brut, remiseLignes, remiseGlobale: globale, remiseTotale, net: brut - remiseTotale };
}
