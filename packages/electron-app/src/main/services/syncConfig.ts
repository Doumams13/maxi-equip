/**
 * Configuration de synchronisation — Phase 3.7, Partie 13. Lue
 * UNIQUEMENT dans le processus principal (`process.env`, jamais
 * transmise telle quelle au Renderer — voir syncService.ts, dont le
 * résultat exposé via IPC ne contient jamais l'URL ni le jeton).
 *
 * `MAXI_EQUIP_API_URL` est déjà documentée depuis la Phase 0 dans
 * `.env.example`, jamais lue par aucun code jusqu'à cette étape.
 * `MAXI_EQUIP_SYNC_JWT` est nouvelle : le jeton applicatif émis hors
 * ligne par `packages/api/src/scripts/emettre-jwt-installation.ts`
 * (Phase 3.5.1) — une seule installation aujourd'hui, donc un seul
 * jeton configuré manuellement, cohérent avec la décision déjà prise de
 * ne jamais exposer de route d'émission automatique.
 */
export interface ConfigurationSync {
  apiUrl: string;
  jwt: string | null;
}

export function getConfigurationSync(): ConfigurationSync {
  return {
    apiUrl: process.env["MAXI_EQUIP_API_URL"] ?? "http://localhost:8787",
    jwt: process.env["MAXI_EQUIP_SYNC_JWT"] ?? null,
  };
}
