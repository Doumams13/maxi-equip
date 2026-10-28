import type { Route } from "../../../../core/types.js";
import { listerPostes } from "../../../../core/posteStore.js";

/**
 * GET /v1/app/postes/list — système multiposte fiable (2026-10-28).
 * Relecture intégrale (jamais paginée/filtrée, même principe que
 * `/app/emplacements/list` — le volume reste celui du nombre de postes
 * d'une installation, trivial : Shop + au plus 5 PCX). Aucune
 * restriction de rôle côté serveur (qui ne connaît aucun compte
 * utilisateur, voir router.ts) — la protection "Administrateur
 * uniquement" de l'écran de gestion des postes reste strictement
 * côté Electron (voir checkAdminGuard.ts).
 */
export const postesListRoute: Route = {
  method: "GET",
  path: "/app/postes/list",
  trustLevel: "app",
  handler: async () => {
    const postes = await listerPostes();
    return { status: 200, body: { postes } };
  },
};
