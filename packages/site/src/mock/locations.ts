import type { CompanyLocation } from "@/lib/types/catalog";

/**
 * Localisations MAXI EQUIP.
 *
 * Règle impérative (cahier des charges §1 et Synthèse d'architecture, étape 4) :
 * SHOP est le seul point de vente présenté comme tel. Akébé et Akanda sont des
 * dépôts de stockage suivis depuis le SHOP — ils ne doivent jamais apparaître
 * comme des lieux d'achat pour éviter toute confusion du client.
 *
 * Adresses précises non fournies dans les documents de référence : la ville
 * (Libreville, Gabon) est confirmée partout, mais aucune adresse de rue ni
 * coordonnées GPS ne sont données. Valeurs ci-dessous marquées "à confirmer"
 * sont donc volontairement génériques et non bloquantes.
 */
export const mockLocations: CompanyLocation[] = [
  {
    id: "loc-shop",
    name: "MAXI EQUIP — SHOP",
    kind: "point_de_vente",
    address: "Adresse exacte à confirmer par MAXI EQUIP",
    city: "Libreville, Gabon",
    hours: "Lundi – Samedi, horaires à confirmer par MAXI EQUIP",
  },
  {
    id: "loc-akebe",
    name: "Dépôt Akébé",
    kind: "depot",
    address: "Adresse exacte à confirmer par MAXI EQUIP",
    city: "Akébé, Libreville, Gabon",
  },
  {
    id: "loc-akanda",
    name: "Dépôt Akanda",
    kind: "depot",
    address: "Adresse exacte à confirmer par MAXI EQUIP",
    city: "Akanda, Libreville, Gabon",
  },
];
