/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le site ne parle jamais directement à la base de données (Synthèse §4) :
  // aucune variable d'environnement sensible n'est exposée au navigateur ici.
  // Les appels à l'API se font depuis des composants serveur / routes de
  // Next.js (voir docs/architecture/PHASE0.md), jamais depuis le client.

  // Les packages partagés (design-system, shared-types) sont écrits en
  // TypeScript avec des imports relatifs explicites en ".js" (convention
  // ESM Node standard, nécessaire pour que domain/ et api/ s'exécutent
  // aussi nativement sous Node — voir docs/architecture/PHASE0.md).
  // Webpack (utilisé par Next.js) ne résout pas nativement un import
  // ".js" vers un fichier ".ts" source, contrairement à Vite/tsx/Node ESM
  // — on le lui indique explicitement ici plutôt que de dupliquer les
  // conventions d'import package par package.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
