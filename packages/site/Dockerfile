# Dockerfile du site MAXI EQUIP — contexte de build = LA RACINE DU MONOREPO
# (docker build -f packages/site/Dockerfile . depuis la racine), même
# raison que packages/api/Dockerfile (résolution des workspaces
# @maxi-equip/domain, @maxi-equip/shared-types, @maxi-equip/design-system,
# tous consommés comme source TypeScript directe).
#
# Utilise `output: "standalone"` de Next.js (next.config.mjs) — copie
# uniquement les fichiers réellement nécessaires à `next start`, jamais
# le reste du monorepo ni les dépendances de développement, pour une
# image finale minimale (recommandation officielle Next.js pour Docker).
#
# NEXT_PUBLIC_API_BASE_URL doit être fournie AU MOMENT DU BUILD (les
# variables NEXT_PUBLIC_* sont figées dans le bundle JavaScript par
# Next.js, jamais relues au démarrage du conteneur) — voir docker-compose.yml.

FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/site/package.json packages/site/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/design-system/package.json packages/design-system/package.json

RUN npm ci --workspace=@maxi-equip/site --workspace=@maxi-equip/domain --workspace=@maxi-equip/shared-types --workspace=@maxi-equip/design-system --include-workspace-root

COPY packages/site packages/site
COPY packages/domain/src packages/domain/src
COPY packages/domain/tsconfig.json packages/domain/tsconfig.json
COPY packages/shared-types/src packages/shared-types/src
COPY packages/shared-types/tsconfig.json packages/shared-types/tsconfig.json
COPY packages/design-system/src packages/design-system/src
COPY packages/design-system/tsconfig.json packages/design-system/tsconfig.json

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build --workspace=@maxi-equip/site

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --gid 1001 maxiequip && useradd --uid 1001 --gid maxiequip --shell /bin/false --create-home maxiequip

# Sortie autonome uniquement (voir next.config.mjs, output: "standalone")
# — .next/static et public/ ne sont PAS inclus automatiquement par cette
# sortie (comportement documenté de Next.js), copiés explicitement ici.
COPY --from=deps --chown=maxiequip:maxiequip /app/packages/site/.next/standalone ./
COPY --from=deps --chown=maxiequip:maxiequip /app/packages/site/.next/static ./packages/site/.next/static
COPY --from=deps --chown=maxiequip:maxiequip /app/packages/site/public ./packages/site/public

USER maxiequip
WORKDIR /app/packages/site
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
