/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
