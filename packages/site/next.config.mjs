/**
 * Correction "Intégration Site Phase 5, Partie 3" — les images produit
 * réelles sont désormais servies par l'API centrale MAXI EQUIP
 * (GET /v1/public/images, voir packages/api/src/routes/v1/public/images.ts),
 * sur l'origine désignée par NEXT_PUBLIC_API_BASE_URL. `next/image`
 * refuse par défaut toute origine externe non explicitement autorisée
 * (protection anti-SSRF de Next.js) — dérivé dynamiquement ici plutôt
 * que codé en dur, pour ne jamais avoir à modifier ce fichier quand
 * l'URL de l'API change entre environnements (test/production).
 */
function remotePatternsFromApiBaseUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) return [];
  try {
    const url = new URL(apiBaseUrl);
    return [
      {
        protocol: url.protocol.replace(":", ""),
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: "/v1/public/images**",
      },
    ];
  } catch {
    return [];
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Déploiement production (VPS + Docker) — build autonome minimal
  // (uniquement les fichiers réellement nécessaires à `next start`,
  // sans le reste du monorepo) — recommandation officielle Next.js pour
  // une image Docker, aucun effet en développement (`next dev`).
  output: "standalone",
  /**
   * Correction "Rectangle parasite" — le petit badge vert observé en bas
   * de page, non reproductible dans le code du site, est l'indicateur de
   * développement intégré à Next.js (badge d'activité de build, injecté
   * automatiquement par le framework en mode `npm run dev`, jamais
   * présent en production `next build`/`next start`, jamais un élément
   * de nos propres composants). Désactivé explicitement plutôt que
   * masqué en CSS, pour traiter la vraie cause plutôt que le symptôme.
   */
  devIndicators: {
    buildActivity: false,
  },
  // Le site ne parle jamais directement à PostgreSQL / au cloud : toute donnée
  // dynamique transite par des services (src/services) qui, en Phase 5, pointent
  // vers des mocks isolés (src/mock) et seront reconnectés à l'API centrale
  // MAXI EQUIP (/v1/public/...) sans changement d'interface. Voir docs/architecture.
  images: {
    // Les images produits mockées sont servies localement
    // (public/images/products, aucun remotePattern nécessaire). Les vraies
    // images (API réelle) sont autorisées dynamiquement ci-dessus.
    remotePatterns: remotePatternsFromApiBaseUrl(),
  },
};

export default nextConfig;
