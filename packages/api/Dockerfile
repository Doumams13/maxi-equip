# Dockerfile de l'API MAXI EQUIP — contexte de build = LA RACINE DU MONOREPO
# (docker build -f packages/api/Dockerfile . depuis la racine, jamais
# depuis packages/api/ — nécessaire pour que npm résolve correctement les
# workspaces @maxi-equip/domain et @maxi-equip/shared-types, consommés
# comme source TypeScript directe, jamais un paquet npm publié).
#
# Deux étages : le premier installe les dépendances (compile
# better-sqlite3-multiple-ciphers pour Linux — nécessaire même si la
# production utilise PostgreSQL, car le module est importé de façon
# inconditionnelle par storeServeur.ts ; PostgreSQL reste le SEUL backend
# réellement utilisé dès que DATABASE_URL est définie, voir
# production-server.ts) ; le second ne contient que le strict nécessaire
# à l'exécution — jamais les outils de compilation dans l'image finale.

FROM node:20-slim AS deps
WORKDIR /app

# Outils de compilation natifs — nécessaires UNIQUEMENT pour installer
# better-sqlite3-multiple-ciphers (node-gyp), jamais présents dans
# l'image finale (étage "runtime" ci-dessous, qui ne repart pas de celui-ci).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Manifests d'abord (meilleure mise en cache Docker — un changement de
# code source seul ne force jamais une réinstallation complète).
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm ci --workspace=@maxi-equip/api --workspace=@maxi-equip/domain --workspace=@maxi-equip/shared-types --include-workspace-root

# Code source réel des trois workspaces nécessaires à l'API — jamais
# electron-app ni site, non utilisés par ce processus.
COPY packages/api/src packages/api/src
COPY packages/api/tsconfig.json packages/api/tsconfig.json
COPY packages/domain/src packages/domain/src
COPY packages/domain/tsconfig.json packages/domain/tsconfig.json
COPY packages/shared-types/src packages/shared-types/src
COPY packages/shared-types/tsconfig.json packages/shared-types/tsconfig.json

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Utilisateur non-root — jamais exécuter le processus en root dans le conteneur.
RUN groupadd --gid 1001 maxiequip && useradd --uid 1001 --gid maxiequip --shell /bin/false --create-home maxiequip

COPY --from=deps --chown=maxiequip:maxiequip /app /app

# Créé ici (jamais uniquement par le volume Docker, dont la propriété par
# défaut serait root) pour que /data/images soit immédiatement
# inscriptible par l'utilisateur non-root "maxiequip" une fois le volume
# nommé monté par-dessus (docker-compose.yml).
RUN mkdir -p /data/images && chown maxiequip:maxiequip /data/images

USER maxiequip
WORKDIR /app/packages/api
EXPOSE 8787

# Exécute src/production-server.ts directement via tsx (déjà le
# comportement de `npm start` en développement — même point d'entrée,
# jamais une seconde méthode de démarrage inventée pour Docker).
#
# Chemin ABSOLU vers /app/node_modules/.bin/tsx : npm workspaces hoiste
# les binaires vers le node_modules RACINE (jamais dans
# packages/api/node_modules/.bin/, qui n'existe pas) — vérifié en
# conditions réelles (le premier déploiement a échoué avec
# "Cannot find module '/app/packages/api/node_modules/.bin/tsx'").
CMD ["node", "/app/node_modules/.bin/tsx", "src/production-server.ts"]
