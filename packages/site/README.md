# MAXI EQUIP — Site vitrine public (Phase 5)

Site public MAXI EQUIP : catalogue de carreaux, panier local, envoi de
demandes de commande (pas de vente en ligne, pas de paiement). Construit en
prévision d'une intégration dans le monorepo MAXI EQUIP, mais **volontairement
indépendant** pour cette phase (cf. `packages/site` isolé, pas de dépendance
vers `packages/domain` ou une base de données).

## Stack

- Next.js 14 (App Router) / React 18 / TypeScript strict
- Tailwind CSS (tokens dans `src/design-system/tokens.ts`)
- Aucune base de données, aucun accès direct à l'API centrale : toutes les
  données passent par une couche de services/adaptateurs (voir plus bas).

## Installation (à faire dans un environnement avec accès réseau)

```bash
npm install
npm run dev        # démarre le serveur de développement
npm run build       # build de production
npm run lint         # ESLint
npm run typecheck   # tsc --noEmit
```

> ⚠️ Ces commandes n'ont pas pu être exécutées lors de la génération de ce
> code (environnement sans accès réseau, voir `docs/RAPPORT_PHASE5.md` pour le
> détail des vérifications réellement effectuées et de leurs limites).

## Architecture des données : mock → API

Aucun composant ni aucune page n'accède directement aux données mockées.
Tout transite par une interface de dépôt (« repository ») :

```
src/services/catalog/CatalogRepository.ts   ← interface (contrat)
src/services/catalog/mockCatalogRepository.ts   ← implémentation Phase 5 (données isolées dans src/mock)
src/services/catalog/apiCatalogRepository.ts    ← squelette pour l'API centrale (non actif)
src/services/catalog/index.ts               ← bascule mock/API selon NEXT_PUBLIC_API_BASE_URL
```

Le même schéma existe pour `services/location` et `services/request`.

**Pour brancher l'API centrale plus tard :**
1. Définir `NEXT_PUBLIC_API_BASE_URL` dans l'environnement.
2. Implémenter les méthodes de `Api*Repository` (actuellement des squelettes
   documentés qui lèvent une erreur explicite si appelés).
3. Aucune page ni aucun composant n'a besoin d'être modifié.

## Images produits

Aucune photo produit réelle n'a été fournie dans le pack de référence. Les
visuels dans `public/images/products/` sont des illustrations générées
localement (motifs de carreaux + mises en situation schématiques), à
remplacer par de vraies photos dès qu'elles seront disponibles — un seul
endroit à modifier : `src/mock/products.ts` (fonction `img()`).

## Ce que ce site ne fait jamais

- Il n'affiche jamais de niveau de stock.
- Il n'accepte aucun paiement en ligne.
- Il ne transmet jamais le panier à un service avant l'envoi explicite d'une
  demande (`/demande`), qui elle-même ne crée qu'une **demande**, jamais une
  vente.
- Il ne présente jamais les dépôts (Akébé, Akanda) comme des lieux d'achat —
  seul le point de vente SHOP l'est.

Voir `docs/RAPPORT_PHASE5.md` (à la racine du pack livré) pour le rapport
complet de cette phase, y compris les points laissés provisoires et à
confirmer par MAXI EQUIP.
