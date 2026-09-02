# MAXI EQUIP — Documentation du socle technique (Phase 0)

Ce document explique comment installer, lancer et tester le projet. Pour le **quoi** et le
**pourquoi** des décisions techniques, se référer aux documents de référence officiels :
`MAXI-EQUIP-Synthese-Architecture.docx` et `MAXI-EQUIP-Corrections-Architecture.docx`. Ce fichier
ne les recopie pas.

## Arborescence

```
maxi-equip/
├── packages/
│   ├── shared-types/    Types communs (Produit, Facture, Demande, ...) — aucune dépendance.
│   ├── domain/          Règles métier pures — dépend uniquement de shared-types.
│   ├── design-system/   Tokens + composants visuels partagés — dépend de shared-types.
│   ├── electron-app/    Application Windows (Electron + React + TypeScript + SQLCipher).
│   ├── api/              API serverless — provider-agnostique (voir plus bas).
│   └── site/             Site vitrine (Next.js).
├── docs/architecture/    Documentation technique (dont ce fichier).
├── infra/                 Réservé à la configuration de déploiement (Phase 3+).
└── scripts/               Scripts d'outillage du monorepo (ex. check-isolation.js).
```

## Installation

Depuis la racine du monorepo :

```
npm install
```

npm installe toutes les dépendances de tous les packages en une seule fois (workspaces npm), et
symlink automatiquement les packages internes (`@maxi-equip/*`) entre eux.

**Important — module natif SQLCipher** : l'installation de `packages/electron-app` déclenche
automatiquement `electron-rebuild` (script `postinstall`) pour reconstruire le module
`better-sqlite3-multiple-ciphers` contre l'ABI native d'Electron. C'est une étape nécessaire et
normale (voir `SQLCIPHER-COMPAT-TEST.md`), pas une erreur si elle prend quelques dizaines de
secondes.

## Lancer chaque package en développement

| Commande (depuis la racine) | Effet                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev:electron`      | Lance l'application Windows (fenêtre Electron + rechargement à chaud)        |
| `npm run dev:api`           | Lance le serveur de développement local de l'API sur `http://localhost:8787` |
| `npm run dev:site`          | Lance le site Next.js sur `http://localhost:3000`                            |

## Vérifications

| Commande                  | Effet                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run typecheck`       | Vérifie les types TypeScript de tous les packages                                            |
| `npm run lint`            | ESLint sur tout le monorepo                                                                  |
| `npm run format:check`    | Vérifie le formatage Prettier (sans corriger)                                                |
| `npm test`                | Exécute tous les tests (Vitest, workspace racine)                                            |
| `npm run check:isolation` | Vérifie qu'aucun package ne viole les règles d'isolation (voir `scripts/check-isolation.js`) |
| `npm run check:all`       | Enchaîne typecheck → lint → isolation → tests                                                |

## Build de production

```
npm run build
```

Construit chaque package qui expose un script `build` (`electron-app`, `site`). Les packages
`domain`, `shared-types` et `design-system` ne sont pas compilés séparément en Phase 0 : ils sont
consommés directement en TypeScript source par les bundlers des trois surfaces (Vite pour
l'application, Next.js pour le site) — décision délibérée pour éviter une étape de build
intermédiaire inutile tant que ces packages ne sont pas publiés indépendamment.

## Environnements

Chaque package consommant des variables d'environnement fournit un `.env.example` (`api/`,
`electron-app/`, `site/`). Copier ces fichiers en `.env` (ou `.env.local` pour Next.js) pour le
développement local — **jamais** committer le fichier réel (`.gitignore` l'exclut explicitement).

La séparation TEST / PRODUCTION (Synthèse §12) se fait au niveau de la valeur des variables
d'environnement (ex. `DATABASE_URL`, `MAXI_EQUIP_ENV`) — l'infrastructure réelle des deux
environnements sera provisionnée en Phase 3.

## Dépendances principales retenues en Phase 0

| Domaine                   | Choix                                                                     | Raison                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Base locale chiffrée      | `better-sqlite3-multiple-ciphers` (+ `@electron/rebuild`)                 | SQLCipher-compatible, testé et validé avec Electron — voir `SQLCIPHER-COMPAT-TEST.md`                               |
| Build application Windows | `electron-vite`                                                           | Gère nativement la séparation main/preload/renderer avec Vite                                                       |
| Tests                     | Vitest                                                                    | Rapide, support TypeScript natif, un seul outil pour tous les packages                                              |
| Qualité de code           | ESLint + Prettier + TypeScript strict                                     | Standard, aucune dépendance à un fournisseur                                                                        |
| API                       | Aucun framework serverless imposé — contrat `Handler` provider-agnostique | Le fournisseur d'hébergement n'est pas encore choisi (Synthèse §2) ; évite un verrouillage précoce (Corrections §2) |

## Ce qui n'est PAS encore fait (volontairement, hors périmètre Phase 0)

- Écrans métier de l'application (Phase 2).
- Règles métier complètes du domaine — fusion facture interne/externe, cohérence des transferts,
  purge des demandes après 7 jours, etc. (Phase 1).
- Authentification réelle (hachage Argon2id, jeton de session) — le routeur API applique déjà la
  distinction des deux niveaux de confiance, mais la vérification cryptographique du jeton est un
  point d'ancrage à compléter en Phase 1 (voir `packages/api/src/core/router.ts`).
- Catalogue, panier, demandes, promotions côté site (Phase 5).
- Choix définitif du fournisseur d'hébergement de l'API/BDD cloud (Phase 3).
- Schéma PostgreSQL cloud (seul le schéma SQLite local est préparé en Phase 0 — voir
  `packages/electron-app/src/main/db/schema.sql`).
