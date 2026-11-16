import accessoiresPose from "../assets/categories/accessoires_pose.png";
import boisMenuiserie from "../assets/categories/bois_menuiserie.png";
import carrelageRevetements from "../assets/categories/carrelage_revetements.png";
import chimieBatiment from "../assets/categories/chimie_batiment.png";
import climatisationVentilation from "../assets/categories/climatisation_ventilation.png";
import couvertureToiture from "../assets/categories/couverture_toiture.png";
import divers from "../assets/categories/divers.png";
import eclairage from "../assets/categories/eclairage.png";
import electricite from "../assets/categories/electricite.png";
import equipementsProtection from "../assets/categories/equipements_protection.png";
import etancheiteIsolation from "../assets/categories/etancheite_isolation.png";
import jardinageExterieur from "../assets/categories/jardinage_exterieur.png";
import materiauxConstruction from "../assets/categories/materiaux_construction.png";
import outillageElectrique from "../assets/categories/outillage_electrique.png";
import outillageManuel from "../assets/categories/outillage_manuel.png";
import peintureDecoration from "../assets/categories/peinture_decoration.png";
import plomberieEvacuation from "../assets/categories/plomberie_evacuation.png";
import portesFenetres from "../assets/categories/portes_fenetres.png";
import sanitairesToilettes from "../assets/categories/sanitaires_toilettes.png";
import visserieFixation from "../assets/categories/visserie_fixation.png";

/**
 * Les 20 catégories visuelles de la version 0.11.1 (même noms, mêmes
 * images, même ordre) — demande du 2026-11-15 : elles doivent TOUJOURS
 * apparaître sur l'accueil du Catalogue, qu'elles existent ou non encore
 * dans SQLite. Jamais créées automatiquement en base pour autant (voir
 * CatalogueAccueilScreen.tsx, qui les fusionne avec les vraies catégories
 * par nom sans jamais appeler `creerCategorie` lui-même).
 */
export const CATEGORIES_INITIALES: { nom: string; image: string }[] = [
  { nom: "Carrelage et revêtements", image: carrelageRevetements },
  { nom: "Matériaux de construction", image: materiauxConstruction },
  { nom: "Sanitaires et toilettes", image: sanitairesToilettes },
  { nom: "Plomberie et évacuation", image: plomberieEvacuation },
  { nom: "Électricité", image: electricite },
  { nom: "Éclairage", image: eclairage },
  { nom: "Peinture et décoration", image: peintureDecoration },
  { nom: "Bois et menuiserie", image: boisMenuiserie },
  { nom: "Couverture et toiture", image: couvertureToiture },
  { nom: "Visserie et fixation", image: visserieFixation },
  { nom: "Outillage manuel", image: outillageManuel },
  { nom: "Outillage électrique", image: outillageElectrique },
  { nom: "Accessoires de pose", image: accessoiresPose },
  { nom: "Étanchéité et isolation", image: etancheiteIsolation },
  { nom: "Équipements de protection", image: equipementsProtection },
  { nom: "Jardinage et espaces extérieurs", image: jardinageExterieur },
  { nom: "Portes et fenêtres", image: portesFenetres },
  { nom: "Chimie du bâtiment", image: chimieBatiment },
  { nom: "Climatisation et ventilation", image: climatisationVentilation },
  { nom: "Divers", image: divers },
];

export function normaliserNomCategorie(nom: string): string {
  return nom.trim().toLowerCase();
}

const IMAGE_PAR_NOM_NORMALISE = new Map(CATEGORIES_INITIALES.map((c) => [normaliserNomCategorie(c.nom), c.image]));

/** Illustration 0.11.1 associée à un nom de catégorie, `null` si aucune des 20 ne correspond. */
export function illustrationParNom(nom: string): string | null {
  return IMAGE_PAR_NOM_NORMALISE.get(normaliserNomCategorie(nom)) ?? null;
}

/**
 * Illustration à afficher pour une catégorie RÉELLE (existant en base) :
 * une image choisie manuellement par l'utilisateur (`imageDataUrl`, voir
 * CategoriesModal) prime toujours sur l'illustration par défaut ; sinon,
 * repli sur l'illustration 0.11.1 si le nom correspond ; sinon `null`
 * (icône neutre affichée par l'appelant).
 */
export function illustrationCategorie(categorie: { nom: string; imageDataUrl: string | null }): string | null {
  return categorie.imageDataUrl ?? illustrationParNom(categorie.nom) ?? null;
}
