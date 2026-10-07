import type { ProductModel } from "@/lib/types/catalog";

/**
 * Jeu de données mocké du catalogue.
 *
 * Isolé volontairement dans src/mock/ (jamais dispersé dans les composants),
 * conformément à la consigne "MOCK API → API MAXI EQUIP doit être facile".
 * Chaque modèle regroupe plusieurs tailles (cahier des charges §3 et §9 :
 * "un même modèle/motif peut exister dans plusieurs tailles" /
 * "regroupement par modèle/motif avec choix de la taille").
 *
 * Les images sont des visuels générés localement (aucune photo produit réelle
 * n'a été fournie dans le pack de référence) — voir public/images/products et
 * le rapport de fin de phase. Elles sont référencées uniquement via
 * getProductImageUrl() pour rester facilement remplaçables.
 */
function img(slug: string, index: 1 | 2 | 3, alt: string, order: number) {
  const filename =
    index === 3 ? `${slug}-3-situation.svg` : `${slug}-${index}.svg`;
  return {
    id: `${slug}-img-${index}`,
    url: `/images/products/${filename}`,
    alt,
    order,
  };
}

export const mockProducts: ProductModel[] = [
  {
    id: "prod-marbre-blanc",
    slug: "marbre-blanc",
    name: "Marbre Blanc",
    type: "Faïence",
    description:
      "Un motif marbré blanc veiné, lumineux et intemporel. S'adapte aussi bien aux séjours qu'aux salles de bain pour un rendu épuré.",
    updatedAt: "2026-08-20T09:00:00.000Z",
    featured: true,
    ordreVitrine: 0,
    images: [
      img("marbre-blanc", 1, "Carreau Marbre Blanc, vue à plat", 0),
      img("marbre-blanc", 2, "Carreau Marbre Blanc, gros plan sur le veinage", 1),
      img("marbre-blanc", 3, "Marbre Blanc posé au sol d'une salle de bain", 2),
    ],
    variants: [
      { id: "var-marbre-blanc-40x40", size: "40x40", reference: "MB-4040", priceFcfa: 9500 },
      { id: "var-marbre-blanc-60x60", size: "60x60", reference: "MB-6060", priceFcfa: 15000 },
      { id: "var-marbre-blanc-80x80", size: "80x80", reference: "MB-8080", priceFcfa: 21000 },
    ],
  },
  {
    id: "prod-marbre-noir",
    slug: "marbre-noir",
    name: "Marbre Noir",
    type: "Faïence",
    description:
      "Motif marbré noir aux veines argentées, pour une ambiance élégante et contemporaine. Très demandé pour les salles de bain haut de gamme.",
    updatedAt: "2026-08-18T09:00:00.000Z",
    featured: true,
    ordreVitrine: 1,
    images: [
      img("marbre-noir", 1, "Carreau Marbre Noir, vue à plat", 0),
      img("marbre-noir", 2, "Carreau Marbre Noir, gros plan sur le veinage", 1),
      img("marbre-noir", 3, "Marbre Noir posé au sol d'une salle de bain", 2),
    ],
    variants: [
      { id: "var-marbre-noir-60x60", size: "60x60", reference: "MN-6060", priceFcfa: 16500 },
      { id: "var-marbre-noir-80x80", size: "80x80", reference: "MN-8080", priceFcfa: 23500 },
    ],
  },
  {
    id: "prod-gres-anthracite",
    slug: "gres-gris-anthracite",
    name: "Grès Gris Anthracite",
    type: "Grès cérame",
    description:
      "Grès cérame gris anthracite uni, résistant et facile d'entretien. Idéal pour les cuisines et les zones de forte circulation.",
    updatedAt: "2026-08-25T09:00:00.000Z",
    featured: false,
    ordreVitrine: null,
    images: [
      img("gres-gris-anthracite", 1, "Carreau Grès Gris Anthracite, vue à plat", 0),
      img("gres-gris-anthracite", 2, "Carreau Grès Gris Anthracite, gros plan sur le joint", 1),
      img("gres-gris-anthracite", 3, "Grès Gris Anthracite posé au sol d'une cuisine", 2),
    ],
    variants: [
      { id: "var-gres-anthracite-30x30", size: "30x30", reference: "GGA-3030", priceFcfa: 6500 },
      { id: "var-gres-anthracite-60x60", size: "60x60", reference: "GGA-6060", priceFcfa: 13000 },
    ],
  },
  {
    id: "prod-terracotta",
    slug: "terracotta-antiderapant",
    name: "Terracotta Antidérapant",
    type: "Antidérapant",
    description:
      "Carreau antidérapant teinte terracotta, conçu pour les extérieurs, terrasses et abords de piscine, tout en gardant un rendu chaleureux.",
    updatedAt: "2026-08-10T09:00:00.000Z",
    featured: true,
    ordreVitrine: null,
    images: [
      img("terracotta-antiderapant", 1, "Carreau Terracotta Antidérapant, vue à plat", 0),
      img("terracotta-antiderapant", 2, "Carreau Terracotta Antidérapant, gros plan sur la texture", 1),
      img("terracotta-antiderapant", 3, "Terracotta Antidérapant posé au sol d'une chambre", 2),
    ],
    variants: [
      { id: "var-terracotta-30x30", size: "30x30", reference: "TA-3030", priceFcfa: 7000 },
      { id: "var-terracotta-40x40", size: "40x40", reference: "TA-4040", priceFcfa: 9800 },
    ],
  },
  {
    id: "prod-mosaique-bleu",
    slug: "mosaique-bleu-blanc",
    name: "Mosaïque Bleu & Blanc",
    type: "Mosaïque",
    description:
      "Mosaïque bleu et blanc en petits carreaux, parfaite pour une crédence de cuisine ou une touche décorative en salle de bain.",
    updatedAt: "2026-08-28T09:00:00.000Z",
    featured: false,
    ordreVitrine: null,
    images: [
      img("mosaique-bleu-blanc", 1, "Plaque Mosaïque Bleu & Blanc, vue à plat", 0),
      img("mosaique-bleu-blanc", 2, "Plaque Mosaïque Bleu & Blanc, gros plan", 1),
      img("mosaique-bleu-blanc", 3, "Mosaïque Bleu & Blanc en crédence de salle de bain", 2),
    ],
    variants: [
      { id: "var-mosaique-bleu-30x30", size: "30x30", reference: "MOS-3030", priceFcfa: 8200 },
    ],
  },
  {
    id: "prod-beige-sable",
    slug: "beige-sable-faience",
    name: "Beige Sable",
    type: "Faïence",
    description:
      "Faïence beige sable au rendu chaleureux et polyvalent, s'associe facilement avec des meubles clairs ou foncés.",
    updatedAt: "2026-08-15T09:00:00.000Z",
    featured: false,
    ordreVitrine: null,
    images: [
      img("beige-sable-faience", 1, "Carreau Beige Sable, vue à plat", 0),
      img("beige-sable-faience", 2, "Carreau Beige Sable, gros plan sur le veinage", 1),
      img("beige-sable-faience", 3, "Beige Sable posé au sol d'une cuisine", 2),
    ],
    variants: [
      { id: "var-beige-sable-40x40", size: "40x40", reference: "BS-4040", priceFcfa: 8700 },
      { id: "var-beige-sable-60x60", size: "60x60", reference: "BS-6060", priceFcfa: 14200 },
    ],
  },
];
