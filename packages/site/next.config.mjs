/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    // Les images produits mockées sont servies localement (public/images/products).
    // Lorsque l'API centrale exposera les vraies images (CDN), ce domaine sera
    // ajouté ici — aucune autre modification de composant ne sera nécessaire
    // puisque toutes les images passent par getProductImageUrl().
    remotePatterns: [],
  },
};

export default nextConfig;
