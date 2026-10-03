import type { Route } from "../../../core/types.js";
import { getIdentiteActuelle } from "../../../core/identiteStore.js";

/**
 * GET /v1/public/settings — correction "L'appli gère les infos du
 * site". Contrairement à `/v1/public/locations.ts` (contenu vitrine
 * STATIQUE, jamais saisi dans l'application), ces informations sont
 * RÉELLEMENT gérées depuis l'écran Paramètres de l'application Electron
 * et synchronisées ici via `/v1/sync/push` (voir core/identiteStore.ts).
 *
 * Tant qu'aucune synchronisation n'a encore eu lieu (projection vide),
 * chaque champ est renvoyé `null` — jamais une valeur inventée ici : le
 * site décide lui-même de son repli (voir services/settings/ côté
 * site, même principe que catalog/location/request).
 */
export const publicSettingsRoute: Route = {
  method: "GET",
  path: "/public/settings",
  trustLevel: "public",
  handler: async () => {
    const identite = await getIdentiteActuelle();

    return {
      status: 200,
      body: {
        settings: identite
          ? {
              nom: identite.nom,
              adresse: identite.adresse || null,
              quartier: identite.quartier || null,
              telephones: identite.telephones,
              whatsapp: identite.whatsapp || null,
              email: identite.email || null,
              updatedAt: identite.updatedAt,
            }
          : {
              nom: null,
              adresse: null,
              quartier: null,
              telephones: [],
              whatsapp: null,
              email: null,
              updatedAt: null,
            },
      },
    };
  },
};
