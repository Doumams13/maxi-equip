/**
 * Cohérence métier du catalogue (unités de vente, caractéristiques
 * typées) — fondations quincaillerie (Phase 3 bis). Ce module ne dépend
 * d'aucune base de données : il construit des règles pures à partir de
 * données déjà résolues (configuration d'une sous-catégorie, entrées
 * saisies), fournies par l'appelant (repositories/IPC, Phase 3 bis).
 *
 * Règle centrale, réutilisée pour unités ET caractéristiques : une
 * contrainte configurée après coup ne s'applique JAMAIS à une valeur
 * déjà enregistrée et non modifiée — seulement à une valeur effectivement
 * soumise au changement (création, ou modification explicite de cette
 * valeur précise). Voir `valeurEffectivementModifiee`.
 */

import { UNITES_VENTE, type UniteVente, type CaracteristiqueEntry, type SousCategorieChamp, type ConfigurationUnitesSousCategorie } from "@maxi-equip/shared-types";

export class ConfigurationUniteVideError extends Error {
  constructor() {
    super("Une sous-catégorie configurée doit autoriser au moins une unité de vente.");
    this.name = "ConfigurationUniteVideError";
  }
}

export class IncompatibiliteUniteError extends Error {
  constructor(unite: UniteVente, unitesAutorisees: UniteVente[]) {
    super(`L'unité "${unite}" n'est pas autorisée pour cette sous-catégorie (unités autorisées : ${unitesAutorisees.join(", ")}).`);
    this.name = "IncompatibiliteUniteError";
  }
}

export class CaracteristiquesObligatoiresManquantesError extends Error {
  constructor(public readonly nomsManquants: string[]) {
    super(`Caractéristiques obligatoires manquantes : ${nomsManquants.join(", ")}.`);
    this.name = "CaracteristiquesObligatoiresManquantesError";
  }
}

/**
 * Valide qu'une configuration d'unités à ENREGISTRER (jamais à lire) ne
 * désigne pas un ensemble vide — décision explicite : une sous-catégorie
 * configurée doit toujours autoriser au moins une unité, pour qu'aucun
 * produit ne devienne invendable. Appelée par le repository avant
 * persistance (`SousCategorieUniteRepository.definir`), jamais à la
 * lecture.
 */
export function validerConfigurationUnites(unites: UniteVente[]): void {
  if (unites.length === 0) {
    throw new ConfigurationUniteVideError();
  }
}

/**
 * Unités réellement proposables pour une sous-catégorie. `configuree:
 * false` (aucune restriction saisie) = les 6 unités de `UNITES_VENTE`,
 * comportement historique pour tout le catalogue non configuré.
 * `configuree: true` renvoie exactement `unites` — jamais vide par
 * construction (voir `validerConfigurationUnites`, appliquée à l'écriture).
 */
export function unitesEffectivesPourSousCategorie(config: ConfigurationUnitesSousCategorie): UniteVente[] {
  return config.configuree ? config.unites : UNITES_VENTE.map((u) => u.valeur);
}

export function uniteEstCompatible(unite: UniteVente, config: ConfigurationUnitesSousCategorie): boolean {
  return unitesEffectivesPourSousCategorie(config).includes(unite);
}

/**
 * Lève si l'unité n'est pas compatible — à utiliser côté serveur
 * (ipc/metier.ts) pour transformer l'incompatibilité en erreur explicite,
 * jamais un simple filtre silencieux côté interface uniquement.
 */
export function validerUniteCompatible(unite: UniteVente, config: ConfigurationUnitesSousCategorie): void {
  if (!uniteEstCompatible(unite, config)) {
    throw new IncompatibiliteUniteError(unite, unitesEffectivesPourSousCategorie(config));
  }
}

/**
 * Principe central de non-régression (voir en-tête du fichier) : une
 * valeur `undefined` (non soumise par l'appelant) ou strictement égale à
 * la valeur actuellement enregistrée n'est JAMAIS un changement effectif
 * — aucune règle configurée après coup ne doit alors s'appliquer.
 * Comparaison par égalité stricte : suffisant ici, les deux usages
 * (unité de vente, caractéristiques sérialisées en JSON) sont des
 * chaînes ou `null`, jamais des objets à comparer en profondeur.
 */
export function valeurEffectivementModifiee<T>(nouvelle: T | undefined, actuelle: T): boolean {
  return nouvelle !== undefined && nouvelle !== actuelle;
}

/**
 * Noms des champs marqués obligatoires pour une sous-catégorie, absents
 * ou vides parmi les entrées fournies — comparaison insensible à la
 * casse sur `cle` (même convention que `fusionnerCaracteristiquesSuggerees`,
 * shared-types/caracteristiques.ts). Ne modifie ni n'invente jamais une
 * entrée : purement un constat.
 */
export function champsObligatoiresManquants(champs: SousCategorieChamp[], entries: CaracteristiqueEntry[]): string[] {
  const valeursParCle = new Map(entries.map((e) => [e.cle.trim().toLowerCase(), e.valeur.trim()]));
  return champs
    .filter((c) => c.obligatoire)
    .filter((c) => !(valeursParCle.get(c.nom.trim().toLowerCase()) ?? "").length)
    .map((c) => c.nom);
}

/** Lève si des champs obligatoires manquent — même usage que `validerUniteCompatible`. */
export function validerCaracteristiquesObligatoires(champs: SousCategorieChamp[], entries: CaracteristiqueEntry[]): void {
  const manquants = champsObligatoiresManquants(champs, entries);
  if (manquants.length > 0) {
    throw new CaracteristiquesObligatoiresManquantesError(manquants);
  }
}

/**
 * Entité minimale comparable pour le diagnostic des doublons potentiels
 * (Phase 5, sous-phase 5.7) — ce module reste indépendant de toute base
 * de données : les entités (déjà résolues par l'appelant, voir
 * `metier.ts`/`catalogue:diagnostiquerDoublonsReferentiel`) sont fournies
 * telles quelles, jamais relues ici.
 */
export interface EntiteComparablePourDoublons {
  id: string;
  nom: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GroupeDoublonPotentiel<T extends EntiteComparablePourDoublons> {
  /** Nom tel que saisi sur la première occurrence rencontrée — jamais normalisé pour l'affichage (la comparaison, elle, est insensible à la casse). */
  nom: string;
  occurrences: T[];
}

/**
 * Détecte les groupes de doublons potentiels — purement un regroupement
 * par nom (comparaison insensible à la casse, `trim()` avant comparaison)
 * : jamais une fusion, jamais une suppression, jamais une modification.
 * Un groupe n'est retenu que s'il contient au moins DEUX IDENTIFIANTS
 * DISTINCTS (deux entités partageant le même id — qui ne devrait jamais
 * se produire en pratique — ne sont jamais considérées comme un doublon).
 *
 * `cleScope` restreint le rapprochement à un même périmètre (ex. une
 * même catégorie parente pour les sous-catégories) — omis, la
 * comparaison porte sur TOUT le jeu fourni (catégories/modèles/produits).
 */
export function detecterDoublonsPotentiels<T extends EntiteComparablePourDoublons>(entites: T[], cleScope?: (entite: T) => string): GroupeDoublonPotentiel<T>[] {
  const groupes = new Map<string, T[]>();
  for (const entite of entites) {
    const cleNom = entite.nom.trim().toLowerCase();
    const cle = cleScope ? `${cleScope(entite)}::${cleNom}` : cleNom;
    (groupes.get(cle) ?? groupes.set(cle, []).get(cle)!).push(entite);
  }

  const resultat: GroupeDoublonPotentiel<T>[] = [];
  for (const occurrencesBrutes of groupes.values()) {
    // Jamais deux fois la même entité (même id) comptée comme deux occurrences distinctes.
    const parId = new Map(occurrencesBrutes.map((e) => [e.id, e]));
    const occurrences = [...parId.values()];
    if (occurrences.length > 1) {
      resultat.push({ nom: occurrences[0]!.nom, occurrences });
    }
  }
  return resultat;
}
