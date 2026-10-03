import type { Route } from "../../../core/types.js";

/**
 * GET /v1/public/locations — correction "Intégration Site Phase 5,
 * Partie 3". Contenu STATIQUE côté serveur (décision documentée dans le
 * rapport de fin de phase) : `CompanyLocation` (nom, adresse commerciale,
 * horaires, lien carte) est un contenu de type "vitrine", jamais saisi
 * nulle part dans l'application Electron (la table `emplacements` ne
 * porte ni adresse, ni horaires, ni lien carte — uniquement les données
 * de gestion de stock, jamais confondues avec ce contenu public). Aucun
 * back-office n'existe pour cette phase (contrainte explicite) : le site
 * appelle malgré tout réellement l'API plutôt que d'embarquer sa propre
 * copie, pour que la source unique reste modifiable ici sans toucher au
 * site. RÈGLE MAINTENUE : SHOP est le seul point de vente présenté comme
 * tel ; Akébé/Akanda restent des dépôts, jamais des lieux d'achat.
 */
export const publicLocationsRoute: Route = {
  method: "GET",
  path: "/public/locations",
  trustLevel: "public",
  handler: () => ({
    status: 200,
    body: {
      locations: [
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
      ],
    },
  }),
};
