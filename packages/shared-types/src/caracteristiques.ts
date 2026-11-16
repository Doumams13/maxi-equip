/**
 * Caractéristiques produit en paires clé/valeur — extension "catalogue
 * par catégories" (Phase 1, fondations quincaillerie). Remplace l'idée
 * d'un éditeur texte libre par des paires répétables ("Diamètre" →
 * "100 mm"), stockées en JSON dans le même champ `caracteristiques`
 * (string) qu'avant — AUCUN schéma par catégorie codé en dur, n'importe
 * quelle catégorie peut saisir n'importe quelle paire (décision
 * explicite, voir le rapport de faisabilité : "jamais un formulaire par
 * famille de produit").
 *
 * Rétrocompatibilité : une ancienne valeur en texte libre (pré-existante
 * avant cette extension) n'est jamais du JSON valide représentant ce
 * format — `parseCaracteristiques` la restitue alors comme une seule
 * entrée sans clé, et `caracteristiquesAffichage` l'affiche telle quelle.
 */
export interface CaracteristiqueEntry {
  cle: string;
  valeur: string;
}

function estEntreesValides(valeur: unknown): valeur is CaracteristiqueEntry[] {
  return (
    Array.isArray(valeur) &&
    valeur.every((e) => e !== null && typeof e === "object" && typeof (e as CaracteristiqueEntry).cle === "string" && typeof (e as CaracteristiqueEntry).valeur === "string")
  );
}

/** Décode le champ `caracteristiques` en paires éditables — jamais une exception, même sur une valeur legacy ou corrompue. */
export function parseCaracteristiques(raw: string | null | undefined): CaracteristiqueEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const decode = JSON.parse(raw);
    if (estEntreesValides(decode)) return decode;
  } catch {
    // Pas du JSON — valeur legacy en texte libre, voir ci-dessous.
  }
  return [{ cle: "", valeur: raw }];
}

/** Encode les paires éditables vers la forme stockée — `null` si aucune paire renseignée (équivalent à "aucune caractéristique", comme avant cette extension). */
export function serialiserCaracteristiques(entries: CaracteristiqueEntry[]): string | null {
  const nettoyees = entries.map((e) => ({ cle: e.cle.trim(), valeur: e.valeur.trim() })).filter((e) => e.cle.length > 0 || e.valeur.length > 0);
  if (nettoyees.length === 0) return null;
  return JSON.stringify(nettoyees);
}

/**
 * Fusionne les noms de champs suggérés par la sous-catégorie (config
 * administrable, voir `sous_categorie_champs` côté electron-app) dans des
 * paires déjà saisies. Les entrées existantes ne sont JAMAIS supprimées
 * ni réordonnées entre elles ; seuls les champs suggérés absents
 * (comparaison insensible à la casse sur `cle`) sont ajoutés, vides, dans
 * l'ordre de configuration, avant les éventuelles entrées déjà saisies
 * qui ne correspondent à aucune suggestion (champs ad hoc).
 */
export function fusionnerCaracteristiquesSuggerees(existantes: CaracteristiqueEntry[], nomsSuggeres: string[]): CaracteristiqueEntry[] {
  const clesExistantes = new Set(existantes.map((e) => e.cle.trim().toLowerCase()));
  const suggestionsManquantes = nomsSuggeres.filter((nom) => !clesExistantes.has(nom.trim().toLowerCase())).map((nom) => ({ cle: nom, valeur: "" }));
  return [...suggestionsManquantes, ...existantes];
}

/** Rendu lisible pour la facture et le site public (ex. "Diamètre : 100 mm · Longueur : 4 m") — une valeur legacy sans clé s'affiche telle quelle, inchangée. */
export function caracteristiquesAffichage(raw: string | null | undefined): string {
  const entries = parseCaracteristiques(raw);
  if (entries.length === 0) return "";
  return entries.map((e) => (e.cle ? `${e.cle} : ${e.valeur}` : e.valeur)).join(" · ");
}
