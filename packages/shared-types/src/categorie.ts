import type { MetierEntity, SoftDeletable } from "./common.js";
import type { UniteVente } from "./produit.js";

/**
 * Catégorie / sous-catégorie du catalogue — fondations quincaillerie
 * (Phase 1). Hiérarchie à deux niveaux, administrable depuis
 * l'application (jamais codée en dur) — voir le rapport de faisabilité
 * correspondant.
 *
 * `ModeleProduit.type` reste inchangé pour ne rien casser (anciennes
 * factures, filtres existants) ; le rattachement d'un modèle à une
 * sous-catégorie est posé par la migration dédiée (voir migrate.ts,
 * tous les carreaux existants sont rattachés à "Carrelage et
 * revêtements") — le câblage du type partagé `ModeleProduit` et du
 * repository associé est traité dans une phase ultérieure (Catalogue),
 * volontairement hors périmètre de cette phase de fondations.
 */
export interface Categorie extends MetierEntity, SoftDeletable {
  nom: string;
  /** Image de la carte catalogue — data URL, même format que les images produit (ImageProduit.cheminLocal), ou `null` si aucune image choisie. */
  imageDataUrl: string | null;
  /** Position d'affichage dans la grille catalogue (0 = premier). */
  ordre: number;
}

/**
 * Modèle physique dédié d'une sous-catégorie — fondations quincaillerie
 * (Phase 3 bis). Vocabulaire fermé, volontairement réduit à un seul
 * membre aujourd'hui : UN concept extensible (ajouter un futur modèle
 * dédié = ajouter une valeur reconnue ici), jamais une colonne booléenne
 * par famille de produit (`supporte_dimensions_tuyau`,
 * `supporte_dimensions_bois`, etc. — explicitement écarté). `"carreau"`
 * est la SEULE valeur posée à ce jour (par migration, sur la
 * sous-catégorie "Carreaux" existante) — le calcul associé (surface
 * carreau/carton, conversion prix m²↔carton) reste dans son mécanisme
 * dédié actuel (`domain/pricing/surfaceCarton.ts`, colonnes natives
 * `produits.largeur/hauteur/carreaux_par_carton`), jamais généralisé.
 * `null` = aucun modèle physique dédié (immense majorité des
 * sous-catégories) — les propriétés physiques éventuelles de ces
 * sous-catégories passent par le système générique `SousCategorieChamp`
 * ci-dessous (ex. diamètre/longueur d'un tuyau), jamais par ce champ.
 */
export type ModelePhysiqueSousCategorie = "carreau";

export interface SousCategorie extends MetierEntity, SoftDeletable {
  categorieId: string;
  nom: string;
  ordre: number;
  modelePhysique: ModelePhysiqueSousCategorie | null;
}

/**
 * Configuration des unités de vente autorisées pour une sous-catégorie —
 * fondations quincaillerie (Phase 3 bis). `configuree: false` = aucune
 * restriction saisie, les 6 unités de `UNITES_VENTE` restent toutes
 * proposées (comportement historique, pour TOUT le catalogue existant).
 * `configuree: true` implique TOUJOURS `unites.length >= 1` — une
 * configuration à zéro unité est rejetée à l'écriture (voir
 * `domain/catalogue`), jamais persistée : il n'existe donc, par
 * construction, que deux états réels, jamais de "configurée mais vide"
 * à distinguer d'une absence de configuration.
 */
export interface ConfigurationUnitesSousCategorie {
  configuree: boolean;
  unites: UniteVente[];
}

export type TypeChampCaracteristique = "texte" | "nombre" | "liste";

/**
 * Catégorisation d'un champ de caractéristique — "calcul" reste une
 * métadonnée informative dans cette phase (aucun moteur générique ne
 * l'exploite, décision explicite : ne jamais construire de moteur de
 * calcul universel). Seul le carreau a une caractéristique réellement
 * calculée, et elle ne passe pas par ce système (voir
 * `ModelePhysiqueSousCategorie` ci-dessus).
 */
export type RoleChampCaracteristique = "descriptif" | "physique" | "calcul";

/**
 * Champ de caractéristique suggéré/configuré pour une sous-catégorie —
 * pure configuration, jamais une donnée transactionnelle : supprimer ou
 * modifier un champ ici n'efface ni ne réinterprète aucune valeur déjà
 * saisie sur un produit (voir Produit.caracteristiques, fusionnée à
 * l'affichage via `fusionnerCaracteristiquesSuggerees`). Pas de
 * suppression douce — une entité purement administrative.
 *
 * `type`/`obligatoire`/`valeursAutorisees`/`uniteMesure`/`role` —
 * fondations quincaillerie (Phase 3 bis), ajoutés à l'entité existante
 * (simple nom suggéré) : toute ligne créée avant cette évolution prend
 * les valeurs par défaut (`type:"texte"`, `obligatoire:false`, le reste
 * `null`) — aucune perte, aucun comportement changé pour l'existant.
 */
export interface SousCategorieChamp extends MetierEntity, SoftDeletable {
  sousCategorieId: string;
  nom: string;
  type: TypeChampCaracteristique;
  /** Bloque réellement la création/modification d'un produit si la valeur est absente/vide — voir `domain/catalogue`. */
  obligatoire: boolean;
  /** Pertinent uniquement si `type === "liste"` — `null` sinon. */
  valeursAutorisees: string[] | null;
  uniteMesure: string | null;
  role: RoleChampCaracteristique | null;
  ordre: number;
}
