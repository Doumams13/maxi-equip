import carreaux from "../assets/sous-categories/carreaux.png";
import collesEtJointsCarrelage from "../assets/sous-categories/colles_et_joints_carrelage.png";
import plinthesEtProfiles from "../assets/sous-categories/plinthes_et_profiles.png";
import revetementsMuraux from "../assets/sous-categories/revetements_muraux.png";

/**
 * Illustrations des sous-catégories quincaillerie. Purement une
 * illustration d'affichage — jamais stockée en SQLite (voir
 * catalogueImages.ts, même principe pour les catégories). `SousCategorie`
 * n'a et n'aura pas de champ image : ce fichier fait uniquement une
 * correspondance par nom (catégorie + sous-catégorie), comme les 20
 * catégories initiales n'étaient qu'un lookup par nom avant d'exister
 * réellement en base.
 *
 * Volontairement limité à "Carrelage et revêtements" pour l'instant — les
 * autres sous-catégories retombent sur l'icône générique dans
 * SousCategoriesScreen.tsx en attendant de nouvelles illustrations.
 */
const ILLUSTRATIONS_SOUS_CATEGORIES: { categorie: string; sousCategorie: string; image: string }[] = [
  { categorie: "Carrelage et revêtements", sousCategorie: "Carreaux", image: carreaux },
  { categorie: "Carrelage et revêtements", sousCategorie: "Revêtements muraux", image: revetementsMuraux },
  { categorie: "Carrelage et revêtements", sousCategorie: "Colles et joints carrelage", image: collesEtJointsCarrelage },
  { categorie: "Carrelage et revêtements", sousCategorie: "Plinthes et profilés", image: plinthesEtProfiles },
];

function normaliser(valeur: string): string {
  return valeur.trim().toLowerCase();
}

const IMAGE_PAR_CLE = new Map(
  ILLUSTRATIONS_SOUS_CATEGORIES.map((entree) => [`${normaliser(entree.categorie)}::${normaliser(entree.sousCategorie)}`, entree.image])
);

/**
 * Illustration fournie pour une sous-catégorie, identifiée par le nom de
 * sa catégorie parente ET son propre nom (certains noms de
 * sous-catégorie, ex. "Accessoires", ne sont pas uniques à l'échelle du
 * catalogue entier). `null` si aucune image n'a été fournie pour cette
 * paire — l'appelant doit alors garder son icône générique, jamais
 * inventer une illustration de repli.
 */
export function illustrationSousCategorie(categorieNom: string, sousCategorieNom: string): string | null {
  return IMAGE_PAR_CLE.get(`${normaliser(categorieNom)}::${normaliser(sousCategorieNom)}`) ?? null;
}
