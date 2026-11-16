# PHASE 5 — PLAN D'IMPLÉMENTATION TECHNIQUE

**Statut : document de planification. Aucune implémentation n'a commencé.**

Ce plan transforme le découpage du §15 de `PHASE_5_CAHIER_DES_CHARGES.md` en 8 sous-phases exploitables, chacune vérifiée contre l'état réel du code (chemins, fonctions, signatures, lignes). Il doit permettre de demander l'exécution d'une seule sous-phase sans refaire l'analyse architecturale.

---

## 0. Vérification préalable de cohérence

### 0.1 Les deux formulations signalées

- **§1.5 du cahier des charges** listait `categories`, `sous_categories`, `sous_categorie_champs`, `sous_categorie_unites` comme 4 éléments de même nature. **Corrigé** : `sous_categorie_unites` est désormais présentée comme une configuration de `sous_categorie`, jamais une entité synchronisée indépendamment.
- **§6.4** portait le tag `[À VALIDER — mais prérequis technique impératif]`, ambigu entre « décision métier ouverte » et « exigence technique déjà actée ». **Corrigé** en `[VALIDÉ — exigence technique, pas une décision métier ouverte]`.
- Une troisième imprécision connexe a été corrigée dans le même mouvement : §13 (stratégie de tests) laissait entendre que `sousCategorieUniteRepository` recevrait son propre test de `creerDepuisServeur()` — corrigé pour refléter que sa réception passe par `SousCategorieRepository.creerDepuisServeur()` (§3.7).

Ces trois corrections ont été appliquées à `PHASE_5_CAHIER_DES_CHARGES.md` (document déjà validé par ailleurs ; aucune décision métier n'a été rouverte, seule la formulation a été harmonisée).

### 0.2 Vérifications code réalisées pour ce plan (non présentes dans le cahier des charges)

En relisant le code réel pour préparer ce plan, cinq précisions supplémentaires ont été établies — elles ne contredisent aucune décision validée, elles les rendent simplement exécutables :

1. **Le mécanisme de rattrapage catch-up (modèle/produit/compte/emplacement) n'est PAS une simple boucle périodique isolée** : chaque service de rattrapage est *injecté* dans `SyncService` via une méthode dédiée (`definirRattrapageCatalogue(...)`, `definirRattrapageComptes(...)`, `definirRattrapageEmplacements(...)`, `syncService.ts:219-244` pour l'exemple catalogue), stocké dans un champ privé optionnel (`rattrapageCatalogue?: {...}`), puis appliqué à l'intérieur de `executerSynchronisation()` (`syncService.ts:277-344`) dans un bloc `if (this.rattrapageX) { try { ... } catch { /* log, jamais d'échec de tout le cycle */ } }`. Le câblage réel se fait dans `main/index.ts:404-408` (`syncService.definirRattrapageCatalogue(modeleRepository, produitRepository, new CatalogueSyncService())`). **`ReferentielSyncService` (§6.6 du cahier des charges) doit suivre exactement ce patron**, pas une boucle `setInterval` séparée.
2. **Le rattrapage proactif ponctuel (comptes) a un précédent exact et directement réutilisable** : `main/index.ts:301-323`, gardé par `if (!boiteEnvoiRepository.existeEntreePourType("compte")) { ... }`. Le rattrapage proactif du référentiel (sous-phase 7) doit suivre ce patron à l'identique.
3. **`ServerStorage` (`packages/api/src/core/serverStorage.ts:385-410`)** est l'interface exacte à étendre — les 6 méthodes `appliquerOperationX`/les 2 méthodes `listerXActifs` y sont déjà déclarées pour les entités existantes ; les nouvelles méthodes s'ajoutent au même endroit.
4. **`runMigrations(db)` (`migrate.ts:82`)** est la fonction maîtresse qui appelle séquentiellement chaque migration idempotente, dans l'ordre, avec des commentaires de phase (ex. ligne 118 : `// Fondations quincaillerie (Phase 1)`). Toute nouvelle migration de schéma doit être ajoutée à la fin de cette séquence (juste avant `setSchemaVersion(db)`, ligne 136), avec son propre commentaire de phase.
5. **Risque concret identifié pour la sous-phase 7 (rattrapage proactif)**, non documenté dans le cahier des charges : `initialiserCategoriesQuincailleriePredefiniesSiAbsentes` (`migrate.ts:609-634`, exécutée par chaque poste indépendamment à sa propre migration locale) crée les catégories/sous-catégories prédéfinies (ex. « Quincaillerie générale ») avec un `randomUUID()` **généré localement sur chaque poste**, jamais un identifiant fixe partagé. **Conséquence directe et quasi certaine** : au premier rattrapage proactif multi-postes, l'écran de diagnostic des doublons (§12.3) affichera très probablement un doublon pour *chacune* des catégories/sous-catégories prédéfinies sur *chaque paire de postes* — ce n'est pas un cas limite hypothétique, c'est le résultat normal et attendu de la façon dont ces données ont été semées jusqu'ici. Ce point est repris en détail en sous-phase 7 et dans les risques critiques (§12 de ce plan).

### 0.3 Autres incohérences recherchées, aucune trouvée

Vérification croisée entre le cahier des charges et le code réel sur : les numéros de ligne cités en §3/§4/§5/§6/§9 du cahier des charges (tous confirmés exacts ou à une poignée de lignes près, sans incidence), la cohérence entre `TYPES_PROJECTION`/`TYPES_AVEC_ORIGINE_POSTE` dans `push.ts` et les entités listées au §5.3, et la cohérence entre les 9+2 gestionnaires IPC cités au §6.3/§6.4 et leur présence réelle dans `ipc/metier.ts` (confirmés aux lignes 378-515). Aucune autre incohérence trouvée.

---

## 1. SOUS-PHASE 1 — Fondations serveur

### 1. Objectif
Poser, côté serveur uniquement, toute la structure de données et de validation nécessaire au référentiel, sans exposer la moindre route — zéro risque, car rien n'est encore accessible de l'extérieur.

### 2. Périmètre exact
- 3 nouvelles tables de projection (`catalogue_categories`, `catalogue_sous_categories`, `catalogue_sous_categorie_champs`), avec la configuration d'unités en colonne de `catalogue_sous_categories`.
- 2 colonnes ajoutées à des tables existantes (`catalogue_modeles.sous_categorie_id`/`marque`, `catalogue_produits.marque`).
- Câblage en écriture des colonnes déjà dormantes (`catalogue_produits.unite_vente`/`caracteristiques`).
- 3 nouveaux validateurs + extension des 2 validateurs existants.
- Extension de l'interface `ServerStorage` et de ses deux implémentations.
- **Exclu explicitement de cette sous-phase** : toute route HTTP, tout code client Electron.

### 3. Fichiers et modules concernés (vérifiés)
- `packages/api/src/core/serverStorage.ts` — interface (lignes 60-104 pour les payloads existants à étendre, lignes 385-410 pour l'interface `ServerStorage` à étendre).
- `packages/api/src/core/sqliteServerStorage.ts` — implémentation dev (schéma `catalogue_modeles`/`catalogue_produits` vers lignes 74-101 approx., `appliquerOperationModele`/`appliquerOperationProduit` vers lignes 255-290).
- `packages/api/src/core/postgresServerStorage.ts` — implémentation prod, miroir strict de SQLite (mêmes plages de lignes approximatives, schéma `comptes_utilisateurs`/`emplacements`/`identite_entreprise` vers lignes 136-182 comme référence de style de migration idempotente).
- `packages/api/src/core/validationCatalogueSync.ts` — `validerOperationModele`/`validerOperationProduit` (lignes 79-105), nouveaux `validerOperationCategorie`/`validerOperationSousCategorie`/`validerOperationSousCategorieChamp` à ajouter dans le même fichier.
- `packages/api/src/core/catalogStore.ts` — à étendre si de nouvelles fonctions de façade sont nécessaires (`appliquerOperationCategorie`, etc.), même patron que les fonctions existantes (lignes 44-54).

### 4. Modifications techniques à effectuer
1. **Migration SQLite serveur** (`sqliteServerStorage.ts`) : ajouter les 3 nouvelles tables (`CREATE TABLE IF NOT EXISTS`, idempotent par construction comme tout le reste du fichier) + `ALTER TABLE catalogue_modeles ADD COLUMN ...`/`ALTER TABLE catalogue_produits ADD COLUMN marque ...` protégés par une vérification d'existence de colonne (`PRAGMA table_info`, même patron que `migrate.ts` côté client).
2. **Migration PostgreSQL** (`postgresServerStorage.ts`) : même structure, syntaxe Postgres (`ADD COLUMN IF NOT EXISTS` est nativement idempotent en Postgres, contrairement à SQLite — vérifier la syntaxe exacte déjà utilisée ailleurs dans ce fichier pour les migrations de colonnes existantes, si une s'y trouve, sinon calquer sur le style SQLite avec une requête de vérification équivalente au catalogue système Postgres `information_schema.columns`).
3. **Validateurs** (`validationCatalogueSync.ts`) : ajouter `validerOperationCategorie`, `validerOperationSousCategorie` (incluant le champ `unitesAutorisees: UniteVente[]` et `modelePhysique`), `validerOperationSousCategorieChamp` — même rigueur que les validateurs existants (UUID, longueur de texte, enum).
4. **Interface + implémentations** : `appliquerOperationCategorie`/`appliquerOperationSousCategorie`/`appliquerOperationSousCategorieChamp` (upsert LWW identique au patron `appliquerOperationModele`), `listerCategoriesActives`/`listerSousCategoriesActives`/`listerSousCategorieChampsActifs` (lecture simple, `WHERE deleted_at IS NULL`).
5. **Étendre** `appliquerOperationModele`/`appliquerOperationProduit` existants pour les nouveaux champs (`sousCategorieId`/`marque` modèle ; `uniteVente`/`caracteristiques`/`marque` produit) — cette tâche est aussi listée en sous-phase 5, mais **le câblage SQL lui-même** (colonnes de l'UPSERT) peut être fait ici en même temps que la migration de schéma, pour éviter deux passes sur le même fichier. La validation/le push client restent en sous-phase 5.

### 5. Dépendances avec les sous-phases précédentes
Aucune — première sous-phase.

### 6. Risques de régression
- Modifier `appliquerOperationModele`/`appliquerOperationProduit` existants (point 5 ci-dessus) touche un chemin déjà en production pour les postes existants — **tout ajout de colonne à l'UPSERT doit être rétrocompatible** : un payload ne contenant pas encore les nouveaux champs (ancien client non mis à jour) ne doit jamais faire échouer l'upsert. Tester explicitement ce cas.
- Toute erreur de syntaxe dans une migration idempotente exécutée au démarrage du serveur bloquerait le démarrage de l'API — tester la migration sur une base vide ET sur une base déjà migrée (exécution multiple).

### 7. Tests unitaires nécessaires
- Chaque nouveau validateur : rejet de payload malformé (UUID invalide, champ manquant, enum invalide), acceptation du payload valide.
- Chaque nouvelle méthode `appliquerOperationX` : upsert initial, upsert avec `updatedAt` plus récent (accepté), upsert avec `updatedAt` plus ancien (rejeté silencieusement, LWW), pour **les deux implémentations** (SQLite et PostgreSQL — patron déjà utilisé pour `appliquerOperationModele`).
- `appliquerOperationModele`/`appliquerOperationProduit` étendus : payload ancien format (sans les nouveaux champs) toujours accepté sans erreur.

### 8. Tests d'intégration nécessaires
- Migration exécutée deux fois de suite sur la même base (idempotence) — pas d'erreur, pas de duplication de colonne.
- Un parcours complet payload → validateur → `appliquerOperationX` → relecture via `listerXActifs` retourne l'état attendu, pour chaque nouvelle entité.

### 9. Critères précis de validation
- Les 3 nouvelles tables existent dans les deux backends, avec les mêmes colonnes (vérifié par un test de parité explicite, ex. introspection `PRAGMA table_info`/`information_schema.columns` comparée).
- Aucune route HTTP n'expose ces nouvelles capacités (vérifié par grep : aucun `router.register` ne référence les nouveaux validateurs à ce stade).
- Tous les tests existants (`npm test` côté `packages/api`) restent verts, sans aucune modification de test préexistant.

### 10. Conditions pour passer à la sous-phase 2
Les 3 tables + 2 colonnes existent dans les deux backends, les validateurs et les méthodes `ServerStorage` sont testés et verts, zéro route exposée.

---

## 2. SOUS-PHASE 2 — Route de lecture catch-up

### 1. Objectif
Exposer en lecture seule le référentiel nouvellement stocké, sans qu'aucun client ne puisse encore y écrire quoi que ce soit — les tables sont encore vides en production, donc cette route ne renvoie rien de sensible tant que la sous-phase 3 n'est pas livrée.

### 2. Périmètre exact
Un unique nouvel endpoint `GET /v1/app/referentiel/list`. Aucune modification de `GET /v1/app/catalogue/list` (décision validée en §5.4 du cahier des charges : endpoint séparé).

### 3. Fichiers et modules concernés (vérifiés)
- Nouveau fichier `packages/api/src/routes/v1/app/referentiel/list.ts`, calqué exactement sur `packages/api/src/routes/v1/app/catalogue/list.ts` (lu intégralement : `trustLevel: "app"`, `handler` appelant `Promise.all([...])` sur les fonctions de lecture de `catalogStore.ts`).
- `packages/api/src/index.ts` — ajouter l'import et `router.register(referentielListRoute)`, même patron exact que les lignes 22 et 36-51 (import ligne 22 pour `catalogueListRoute`, registre ligne 41 pour `publicCatalogModelsRoute` — à placer dans le même bloc de déclarations).
- `packages/api/src/core/catalogStore.ts` — si les fonctions `listerCategoriesActives`/etc. n'y sont pas déjà exposées en façade (ajoutées en sous-phase 1, point 4), les ajouter ici.

### 4. Modifications techniques à effectuer
1. Créer `list.ts` : `handler: async () => { const [categories, sousCategories, sousCategorieChamps] = await Promise.all([listerCategoriesActives(), listerSousCategoriesActives(), listerSousCategorieChampsActifs()]); return { status: 200, body: { categories, sousCategories, sousCategorieChamps } }; }`.
2. Enregistrer la route dans `index.ts`.

### 5. Dépendances avec les sous-phases précédentes
Nécessite la sous-phase 1 (les méthodes de lecture `ServerStorage` doivent exister).

### 6. Risques de régression
Aucun — nouvelle route isolée, ne touche à aucun code existant en dehors de l'ajout d'une ligne d'enregistrement dans `index.ts`.

### 7. Tests unitaires nécessaires
Aucun au-delà de ceux de la sous-phase 1 (la route elle-même est un simple agrégateur sans logique propre).

### 8. Tests d'intégration nécessaires
- Appel `GET /v1/app/referentiel/list` sans authentification → refusé (401), cohérent avec `trustLevel: "app"` et le middleware centralisé (`router.ts:70-81`).
- Appel authentifié sur une base vide → `{ categories: [], sousCategories: [], sousCategorieChamps: [] }`.
- Appel authentifié après insertion directe en base (via les méthodes de la sous-phase 1, sans passer par un push réel) → contenu correct restitué.

### 9. Critères précis de validation
La route répond 200 avec la forme attendue pour un poste authentifié, 401 sinon, et ne modifie jamais rien (vérifié en confirmant l'absence de toute requête `INSERT`/`UPDATE` dans son chemin de code).

### 10. Conditions pour passer à la sous-phase 3
Route testée et verte, aucune régression sur les routes existantes (suite de tests API complète toujours verte).

---

## 3. SOUS-PHASE 3 — Push client → serveur

### 1. Objectif
Permettre à un poste de pousser ses modifications du référentiel vers le serveur. **Fenêtre intermédiaire volontairement asymétrique** : à la fin de cette sous-phase, les données arrivent côté serveur, mais aucun autre poste ne les applique encore localement (la sous-phase 4 n'existe pas encore) — c'est la raison pour laquelle cette sous-phase est sûre à livrer isolément : rien ne peut encore se mélanger entre deux SQLite locales.

### 2. Périmètre exact — les 9 gestionnaires de base et les 2 gestionnaires d'unités, explicitement distingués

**Les 9 gestionnaires de base** (`ipc/metier.ts`, lignes vérifiées) :

| # | Gestionnaire | Ligne vérifiée |
|---|---|---|
| 1 | `catalogue:creerCategorie` | 378 |
| 2 | `catalogue:modifierCategorie` | 384 |
| 3 | `catalogue:supprimerCategorie` | 390 (modifié aussi en sous-phase 6, garde bloquante) |
| 4 | `catalogue:creerSousCategorie` | 406 |
| 5 | `catalogue:modifierSousCategorie` | 412 |
| 6 | `catalogue:supprimerSousCategorie` | 418 (modifié aussi en sous-phase 6) |
| 7 | `catalogue:creerChampSousCategorie` | 439 |
| 8 | `catalogue:modifierChampSousCategorie` | 464 |
| 9 | `catalogue:supprimerChampSousCategorie` | 484 (modifié aussi en sous-phase 6, tombstone) |

**Les 2 gestionnaires d'unités, séparés intentionnellement** (patron de repository différent, c'est précisément le point de rupture identifié par l'audit) :

| # | Gestionnaire | Ligne vérifiée |
|---|---|---|
| 10 | `catalogue:definirUnitesSousCategorie` | 501 |
| 11 | `catalogue:reinitialiserUnitesSousCategorie` | 511 |

### 3. Fichiers et modules concernés (vérifiés)
- `packages/electron-app/src/main/repositories/boiteEnvoiRepository.ts` — `TypeOperationBoiteEnvoi` (lignes 25-49 actuelles) à étendre de 3 types (`"categorie" | "sous_categorie" | "sous_categorie_champ"`).
- `packages/electron-app/src/main/ipc/metier.ts` — les 11 gestionnaires ci-dessus + 3 nouvelles fonctions d'enfilage à créer, calquées sur `enqueueModeleSync`/`enqueueProduitSync` (lignes 1581-1611 actuelles).
- `packages/api/src/routes/v1/app/sync/push.ts` — `TYPES_PROJECTION` (ligne 48-49 actuelle) à étendre de 3 entrées ; dispatch (lignes 88-99 et 108-120 actuelles) à étendre des 3 nouveaux appels `validerOperationX`/`appliquerOperationX`.

### 4. Modifications techniques à effectuer
1. **`boiteEnvoiRepository.ts`** : étendre `TypeOperationBoiteEnvoi`.
2. **`enqueueCategorieSync(boiteEnvoiRepository, categorie, operation)`** : payload `{ operation, categorieId: categorie.id, nom: categorie.nom, imageDataUrl: categorie.imageDataUrl, ordre: categorie.ordre, updatedAt: categorie.updatedAt }`.
3. **`enqueueSousCategorieSync(boiteEnvoiRepository, sousCategorie, unitesAutorisees, operation)`** : payload `{ operation, sousCategorieId: sousCategorie.id, categorieId: sousCategorie.categorieId, nom: sousCategorie.nom, ordre: sousCategorie.ordre, modelePhysique: sousCategorie.modelePhysique, unitesAutorisees, updatedAt: sousCategorie.updatedAt }` — **la configuration d'unités est lue au moment de l'enfilage** (via `sousCategorieUniteRepository.obtenirConfiguration(id)`, déjà existant) et transmise en sous-objet, jamais séparément.
4. **`enqueueSousCategorieChampSync(boiteEnvoiRepository, champ, operation)`** : payload reprenant tous les champs de `SousCategorieChamp` (nom, type, obligatoire, valeursAutorisees, uniteMesure, role, ordre, updatedAt).
5. **Câblage des 9 gestionnaires de base** : ajouter l'appel d'enfilage approprié après chaque `create()`/`update()`/`softDelete()` (même position que les appels `enqueueModeleSync` existants dans les gestionnaires modèle).
6. **Câblage des 2 gestionnaires d'unités (tâche distincte, non optionnelle)** : dans `catalogue:definirUnitesSousCategorie` (ligne 501) et `catalogue:reinitialiserUnitesSousCategorie` (ligne 511), après l'appel à `sousCategorieUniteRepository.definir()`/`reinitialiser()`, récupérer la sous-catégorie à jour (`sousCategorieRepository.findById(sousCategorieId)`) et appeler `enqueueSousCategorieSync(...)` avec la configuration d'unités fraîchement écrite.
7. **`push.ts`** : étendre `TYPES_PROJECTION`, ajouter les 3 branches de validation/application dans les deux blocs de dispatch existants (lignes 88-99 pour la validation, 108-120 pour l'application).

### 5. Dépendances avec les sous-phases précédentes
Nécessite la sous-phase 1 (validateurs/méthodes serveur doivent exister pour que le push soit accepté).

### 6. Risques de régression
- Étendre `TYPES_PROJECTION` dans `push.ts` touche un fichier déjà critique pour le chemin vente/mouvement — **le routage hérité (lignes 79-87 du fichier actuel) ne doit subir aucune modification**, seule la liste `TYPES_PROJECTION`/le `switch` de dispatch catalogue s'allonge. Un test de non-régression explicite sur le chemin vente est impératif (voir ci-dessous).
- Oubli du câblage des gestionnaires d'unités (point 6) — **risque déjà identifié et documenté**, raison pour laquelle le test ci-dessous doit être écrit en premier, avant le câblage lui-même (test-first), pour qu'il échoue visiblement tant que le câblage n'est pas fait.

### 7. Tests unitaires nécessaires
- Chaque nouvelle fonction d'enfilage : payload correctement formé, type d'entité correct déposé dans `boite_envoi`.
- `enqueueSousCategorieSync` : la configuration d'unités transmise correspond bien à l'état actuel de `sous_categorie_unites`, pas à un état périmé.

### 8. Tests d'intégration nécessaires
- **Test de non-régression explicite** : un lot `push` contenant une opération `vente` traverse `push.ts` et produit exactement le même résultat qu'avant cette sous-phase (comparaison byte-à-byte du comportement, pas seulement « ça ne plante pas »).
- Pour chacun des 11 gestionnaires : déclencher l'action IPC localement → vérifier qu'une entrée apparaît dans `boite_envoi` avec le bon `entity_type`/payload.
- **Test dédié et indépendant, exigé explicitement** : modifier UNIQUEMENT la configuration d'unités d'une sous-catégorie (sans toucher nom/ordre/catégorie) via `catalogue:definirUnitesSousCategorie` → vérifier qu'une entrée `sous_categorie` apparaît dans `boite_envoi`, contenant la configuration d'unités à jour. Ce test doit être écrit comme un fichier/describe séparé des tests génériques de modification de sous-catégorie, pour qu'un futur refactoring ne puisse pas le fusionner silencieusement et perdre sa valeur de détection.
- Un push complet (via `POST /v1/sync/push` réellement appelé, pas mocké) pour chacune des 3 nouvelles entités est accepté par le serveur et matérialisé dans la projection (vérifiable via une lecture directe des méthodes `ServerStorage`, la route de lecture n'étant pas encore branchée à l'usage réel tant que la sous-phase 4 n'existe pas côté client).

### 9. Critères précis de validation
Les 11 gestionnaires poussent correctement ; le test dédié "unités seules" passe ; le test de non-régression vente passe ; aucune autre route/comportement n'est modifié (diff de code limité aux fichiers listés en §3).

### 10. Conditions pour passer à la sous-phase 4
Tous les tests ci-dessus verts, y compris le test dédié des unités, **avant** de considérer cette sous-phase terminée.

---

## 4. SOUS-PHASE 4 — Application locale (pull)

### 1. Objectif
Fermer la boucle : un poste applique localement ce qu'un autre poste a poussé. C'est la première sous-phase où deux postes convergent réellement.

### 2. Périmètre exact
`creerDepuisServeur()` sur 3 repositories (`CategorieRepository`, `SousCategorieRepository`, `SousCategorieChampRepository`), un nouveau `ReferentielSyncService`, son injection dans `SyncService` selon le patron vérifié en §0.2.

### 3. Fichiers et modules concernés (vérifiés)
- `packages/electron-app/src/main/repositories/categorieRepository.ts`, `sousCategorieRepository.ts`, `sousCategorieChampRepository.ts` — nouvelles méthodes, calquées sur `ModeleRepository.creerDepuisServeur` (`modeleRepository.ts:71-86`, lu intégralement : `SELECT id FROM ... WHERE id = ?` puis `UPDATE` ou `INSERT` selon existence, id serveur conservé tel quel).
- Nouveau fichier `packages/electron-app/src/main/services/referentielSyncService.ts`, calqué sur `catalogueSyncService.ts` (lu intégralement : classe avec une méthode async `recupererX()`, `AbortController` + timeout 15s, retour `{success:true,...}|{success:false,message}`).
- `packages/electron-app/src/main/services/syncService.ts` — nouveau champ privé `rattrapageReferentiel?`, nouvelle méthode `definirRattrapageReferentiel(...)` (calquée sur `definirRattrapageCatalogue`, lignes 193-244 actuelles), nouveau bloc `if (this.rattrapageReferentiel) {...}` à l'intérieur de `executerSynchronisation()` (après le bloc catalogue existant, lignes 318-330 actuelles).
- `packages/electron-app/src/main/index.ts` — ajout de l'appel `syncService.definirRattrapageReferentiel(...)`, au même endroit que les 3 appels existants (lignes 404-408 actuelles).

### 4. Modifications techniques à effectuer
1. **`CategorieRepository.creerDepuisServeur(categorie)`** : id serveur conservé, upsert local inconditionnel sur `nom`/`imageDataUrl`/`ordre`/`deletedAt` (tombstone compris, voir sous-phase 6).
2. **`SousCategorieRepository.creerDepuisServeur(sousCategorie, unitesAutorisees)`** : upsert local sur `categorieId`/`nom`/`ordre`/`modelePhysique`/`deletedAt`, **puis**, dans la même opération, appel à `sousCategorieUniteRepository.definir(sousCategorie.id, unitesAutorisees)` si `unitesAutorisees.length > 0`, sinon `sousCategorieUniteRepository.reinitialiser(sousCategorie.id)` — **voir point 6 ci-dessous pour la question transactionnelle explicitement demandée**.
3. **`SousCategorieChampRepository.creerDepuisServeur(champ)`** : upsert local incluant `deletedAt`/`deletedBy` (tombstone, cohérent avec la sous-phase 6).
4. **`ReferentielSyncService.recupererReferentiel()`** : `GET /v1/app/referentiel/list`, retour typé `{success:true, categories, sousCategories, sousCategorieChamps} | {success:false, message}`.
5. **`SyncService`** : nouveau champ + méthode + bloc d'application, strictement calqués sur le patron catalogue, avec logging d'erreur non bloquant identique (`console.error("[sync] rattrapage du référentiel impossible :", ...)`).
6. **`main/index.ts`** : instancier et injecter, juste après les 3 appels `definirRattrapageX` existants.

### 5. Dépendances avec les sous-phases précédentes
Nécessite la sous-phase 2 (route de lecture) et la sous-phase 3 (sans push réel, rien à lire de pertinent — mais la sous-phase 4 peut être développée et testée avec des données insérées directement côté serveur sans attendre que 3 soit en production, car ce sont deux chemins de code indépendants testés chacun isolément).

### 6. Comportement transactionnel de `SousCategorieRepository.creerDepuisServeur()` — vérification demandée explicitement
**Constat sur le code existant** : aucune des méthodes `creerDepuisServeur()` actuelles (`ModeleRepository`, à utiliser comme référence) n'ouvre de transaction explicite — chaque appel est une requête SQL unique (`UPDATE` ou `INSERT`). Pour `SousCategorieRepository.creerDepuisServeur()`, qui doit désormais effectuer **deux opérations liées** (upsert de la sous-catégorie + appel à `sousCategorieUniteRepository.definir()`, qui lui-même ouvre déjà sa propre transaction interne, `sousCategorieUniteRepository.ts:55-61`), **une transaction englobante explicite est nécessaire** (`db.transaction(() => { ...upsert sous-catégorie...; sousCategorieUniteRepository.definir(...); })()`), pour garantir qu'une sous-catégorie ne soit jamais mise à jour sans que sa configuration d'unités le soit dans la même opération atomique — sans quoi un crash entre les deux étapes laisserait un état incohérent (sous-catégorie à jour, unités périmées) qui ne serait jamais rattrapé avant le cycle de catch-up suivant (5 minutes, acceptable mais à documenter comme fenêtre de risque temporaire, pas une incohérence permanente).

### 7. Risques de régression
- Toute erreur dans le nouveau bloc `rattrapageReferentiel` ne doit jamais faire échouer tout `executerSynchronisation()` — garanti par le `try/catch` déjà pratiqué pour les 3 blocs existants, à reproduire à l'identique (ne pas innover ici).
- `SousCategorieUniteRepository.definir()` refuse une liste vide (`domainCatalogue.validerConfigurationUnites`, déjà existant) — le catch-up doit distinguer explicitement « aucune configuration » (`reinitialiser()`) de « configuration vide invalide » (ne doit jamais se produire si le serveur a correctement validé le payload en amont, sous-phase 1).

### 8. Tests unitaires nécessaires
- Chaque `creerDepuisServeur()` : création si absent, mise à jour si id déjà présent, jamais de doublon.
- Test spécifique **transactionnel** : simuler un échec de `sousCategorieUniteRepository.definir()` après le début de l'upsert de la sous-catégorie → vérifier que la sous-catégorie n'est PAS mise à jour non plus (rollback complet).
- `ReferentielSyncService` : succès réseau, échec réseau (timeout), réponse HTTP non-200.

### 9. Tests d'intégration nécessaires
- **Simulation deux postes** : poste A pousse une sous-catégorie avec une configuration d'unités (sous-phase 3 déjà livrée) → poste B (base SQLite locale distincte, même serveur de test) exécute son cycle de catch-up → la sous-catégorie ET sa configuration d'unités apparaissent identiques sur B.
- Catch-up sur un poste dont certaines entités référencées n'existent pas encore localement (ex. `sous_categorie` reçue avant sa `categorie` parente, selon l'ordre d'application choisi) — vérifier le comportement défini (tolérance FK, cohérent avec le reste du PULL, cf. §10 du cahier des charges).

### 10. Critères précis de validation
Simulation deux postes verte ; test transactionnel vert ; aucune régression sur le catch-up modèle/produit/compte/emplacement existant (suite complète toujours verte).

### 11. Conditions pour passer à la sous-phase 5
Boucle complète (push sous-phase 3 → pull sous-phase 4) validée de bout en bout sur au moins un scénario par entité (catégorie, sous-catégorie avec unités, champ).

---

## 5. SOUS-PHASE 5 — Complétude modèle/produit

### 1. Objectif
Compléter les payloads `modele`/`produit` déjà synchronisés avec les 5 champs manquants identifiés par l'audit, sans rien casser de leur comportement historique.

### 2. Périmètre exact — les 5 champs, explicitement listés
- `modele.sousCategorieId`
- `modele.marque`
- `produit.uniteVente`
- `produit.caracteristiques`
- `produit.marque`

### 3. Fichiers et modules concernés (vérifiés)
- `packages/electron-app/src/main/ipc/metier.ts` — `enqueueModeleSync` (lignes 1581-1589 actuelles), `enqueueProduitSync` (lignes 1592-1611 actuelles).
- `packages/api/src/core/validationCatalogueSync.ts` — `validerOperationModele`/`validerOperationProduit` (lignes 79-105 actuelles).
- `packages/api/src/core/sqliteServerStorage.ts` **et** `postgresServerStorage.ts` — `appliquerOperationModele`/`appliquerOperationProduit` (déjà étendues en sous-phase 1, point 5 — si ce n'est pas encore fait, c'est ici que cela doit l'être au plus tard).
- `packages/electron-app/src/main/services/catalogueSyncService.ts` — `ModeleCatalogueCatchup`/`ProduitCatalogueCatchup` (lignes 5-21 actuelles), et le type de retour de `recupererCatalogue()`.
- `packages/api/src/routes/v1/app/catalogue/list.ts` — aucune modification de structure nécessaire (délègue déjà à `listerModelesActifs()`/`listerProduitsActifs()`, qui renverront naturellement les nouveaux champs une fois les lignes 1-2 ci-dessus étendues).
- `packages/electron-app/src/main/repositories/modeleRepository.ts` / `produitRepository.ts` — `creerDepuisServeur()` (`modeleRepository.ts:71-86` ; équivalent produit) à étendre pour écrire les nouveaux champs reçus.
- `packages/electron-app/src/main/services/syncService.ts` — les signatures structurelles inline de `definirRattrapageCatalogue`/`rattrapageCatalogue` (lignes 193-242 actuelles) **doivent être étendues** pour inclure les nouveaux champs dans leurs types `{ creerDepuisServeur(modele: {...}): void }` — sans cette extension, TypeScript empêcherait de facto la compilation si les champs sont ajoutés ailleurs sans être reflétés ici (dépendance technique vérifiée, non mentionnée explicitement dans le cahier des charges).

### 4. Modifications techniques à effectuer
1. Étendre `enqueueModeleSync`/`enqueueProduitSync` avec les 5 champs.
2. Étendre les 2 validateurs.
3. Étendre les 2 méthodes `appliquerOperationX` (colonnes de l'`UPSERT`) — si déjà fait en sous-phase 1, vérifier ici plutôt que refaire.
4. Étendre `ModeleCatalogueCatchup`/`ProduitCatalogueCatchup` et la lecture de la réponse HTTP correspondante.
5. Étendre `ModeleRepository.creerDepuisServeur`/équivalent produit.
6. Étendre les signatures structurelles dans `syncService.ts` (point listé en §3 ci-dessus) — sans quoi la sous-phase ne compile pas.

### 5. Dépendances avec les sous-phases précédentes
Peut être développée en parallèle de 1-4 (elle touche un chemin de code différent — modèle/produit, pas catégorie/sous-catégorie/champ), mais ne doit être **activée en production** qu'après la sous-phase 1 (colonnes serveur présentes).

### 6. Risques de régression
- **Risque principal, déjà identifié par l'audit** : un poste non mis à jour (ancien client) continue d'envoyer un payload `modele`/`produit` sans les 5 nouveaux champs — le validateur serveur doit les traiter comme optionnels/nullable, jamais les exiger, sous peine de rejeter silencieusement tous les push des postes pas encore migrés.
- `uniteVenteEffective()` (déjà existante, Phase 4 de ce projet) traite `null` comme « carton » — ce comportement ne doit jamais être réévalué ou dupliqué ici, uniquement réutilisé tel quel si un calcul de ventilation intervient quelque part dans ce chemin (normalement non, ce chemin ne fait que transporter la donnée brute).

### 7. Tests unitaires nécessaires
- Validateurs : payload sans les 5 nouveaux champs toujours accepté (rétrocompatibilité), payload avec les 5 champs renseignés accepté et correctement typé.
- `creerDepuisServeur` (modèle et produit) : réception d'un payload avec les nouveaux champs écrit bien les colonnes correspondantes.

### 8. Tests d'intégration nécessaires
- Push d'un modèle/produit complet (5 champs renseignés) → catch-up sur un second poste → les 5 champs sont identiques des deux côtés.
- Push d'un modèle/produit **sans** ces champs (simulant un ancien client) → aucune erreur, champs restent `null` côté serveur et au catch-up.
- **Parité SQLite/PostgreSQL** : le même scénario d'upsert produit un état identique dans les deux backends (test déjà requis en sous-phase 1, à réexécuter ici avec les 5 nouveaux champs renseignés).

### 9. Critères précis de validation
Les 5 champs transitent correctement de bout en bout (push → projection → catch-up → écriture locale) sur les deux backends serveur ; aucune régression sur les tests Phase 4 existants (`factureDocumentService.visuel.test.ts` et la suite associée, qui ne doivent **jamais** être affectés par ce chemin).

### 10. Conditions pour passer à la sous-phase 6
Tous les tests ci-dessus verts ; confirmation explicite qu'un ancien payload (sans les 5 champs) continue d'être accepté sans erreur.

---

## 6. SOUS-PHASE 6 — Gestion des suppressions

### 1. Objectif
Mettre en place, distinctement, les 4 mécanismes validés : gardes bloquantes locales, tombstones, confirmation renforcée pour un champ obligatoire, badge de classification orpheline.

### 2. Périmètre exact, les 4 mécanismes distingués

| Mécanisme | Entités concernées | Nature |
|---|---|---|
| Garde bloquante locale | Catégorie (bloquée par sous-catégories actives), Sous-catégorie (bloquée par modèles actifs) | Empêche l'action à la source, avant tout enfilage |
| Tombstone | Champ de caractéristique | Remplace une suppression physique par `deleted_at`/`deleted_by` |
| Confirmation renforcée | Champ obligatoire spécifiquement | Couche IHM supplémentaire, au-dessus du tombstone |
| Badge de classification orpheline | Modèle/produit référençant une catégorie/sous-catégorie supprimée | Affichage dérivé, côté poste destinataire d'une suppression |

### 3. Fichiers et modules concernés (vérifiés)

**Gardes bloquantes** :
- `packages/electron-app/src/main/ipc/metier.ts` — `catalogue:supprimerCategorie` (ligne 390 actuelle, corps lignes 390-396) : ajouter `if (sousCategorieRepository.listByCategorie(id).length > 0) return { success: false, message: "..." };` avant `softDelete()`.
- Même fichier — `catalogue:supprimerSousCategorie` (ligne 418, corps 418-424) : ajouter une requête `modeleRepository` (méthode à vérifier/ajouter si absente — `ModeleRepository` n'expose aujourd'hui que `findById`/`list`/`softDelete`/etc., **une nouvelle méthode `listBySousCategorie(id)` ou équivalent est probablement nécessaire**, à vérifier au moment de l'implémentation ; sinon une requête directe `modeles_produit WHERE sous_categorie_id = ? AND deleted_at IS NULL`) avant `softDelete()`.

**Tombstone** :
- `packages/electron-app/src/main/db/migrate.ts` — nouvelle fonction de migration (ex. `ajouterColonnesDeletedChampsSousCategorieSiAbsentes`), ajoutée à la séquence de `runMigrations` (après la ligne 135 actuelle, avant `setSchemaVersion`).
- `packages/electron-app/src/main/repositories/sousCategorieChampRepository.ts` — `delete(id)` (lignes 134-136 actuelles, `DELETE FROM` pur) remplacé par un `UPDATE ... SET deleted_at = ?, deleted_by = ?`. `listBySousCategorie()`/`listGroupesParSousCategorie()` (lignes 43-59 actuelles) à filtrer `WHERE deleted_at IS NULL`.
- `packages/electron-app/src/main/ipc/metier.ts` — `catalogue:supprimerChampSousCategorie` (ligne 484) : signature à faire évoluer pour recevoir un paramètre `deletedBy`/`confirmationObligatoire` selon le point suivant.

**Confirmation renforcée (champ obligatoire)** :
- Même gestionnaire IPC — avant d'appeler `delete()`, vérifier `champ.obligatoire === true` (lecture via `sousCategorieChampRepository.listBySousCategorie`/`findById` si cette méthode existe, sinon à ajouter) et exiger un paramètre de confirmation explicite transmis par l'appelant. **Le mécanisme précis d'IHM (dialogue, double confirmation) reste hors périmètre technique de ce plan**, comme déjà noté dans le cahier des charges — seul le contrat IPC (paramètre requis) est de la responsabilité de cette sous-phase.

**Badge de classification orpheline** :
- Écrans concernés à identifier précisément (point 4 ci-dessous) — probablement `CatalogueAccueilScreen.tsx`/`SousCategoriesScreen.tsx`/l'écran ou composant de formulaire de modèle (nom exact à confirmer par une recherche dans `packages/electron-app/src/renderer/app/screens/` au moment de l'implémentation ; non lu dans le cadre de ce plan pour respecter la contrainte de lecture seule sur les écrans non directement cités par le cahier des charges).
- `packages/electron-app/src/main/repositories/modeleRepository.ts` (et équivalent produit si la classification y est aussi affichée) — la méthode qui retourne les modèles pour l'écran devra être étendue d'un `LEFT JOIN` vers `sous_categories` pour exposer un champ dérivé (ex. `sousCategorieSupprimee: boolean`), jamais une nouvelle colonne stockée (cohérent avec la décision validée).

### 4. Identification des écrans exacts concernés par le badge — proposition, sans modification
**Ce plan ne modifie aucun écran** (contrainte explicite). La proposition technique pour l'implémentation future : une recherche ciblée (`grep` sur `sousCategorieId`/`ModeleProduit` dans `packages/electron-app/src/renderer/app/`) devra être effectuée **au début de l'exécution de cette sous-phase**, pas avant, pour lister précisément : (a) l'écran de liste/grille des modèles (où un badge compact serait visible sans ouvrir chaque fiche), (b) le formulaire d'édition d'un modèle (où le badge serait visible au moment précis où l'utilisateur devrait reclasser l'entité). Cette recherche est elle-même une tâche de la sous-phase, pas un travail à anticiper ici — conformément à la contrainte « ne pas modifier les écrans hors périmètre » et à la décision déjà validée que « l'emplacement exact du badge sera précisé après identification précise des écrans concernés » (§9.4 du cahier des charges).

### 5. Dépendances avec les sous-phases précédentes
Nécessite la sous-phase 4 (le badge n'a de sens que si des suppressions peuvent effectivement être reçues d'un autre poste).

### 6. Risques de régression
- Le tombstone sur `sous_categorie_champs` change le comportement de `listBySousCategorie()`/`listGroupesParSousCategorie()`, utilisées par l'écran de configuration des champs ET par `fusionnerCaracteristiquesSuggerees()` (via les noms de champs suggérés) — **vérifier explicitement qu'un champ tombstoné n'est plus jamais suggéré sur un formulaire produit**, tout en confirmant que les valeurs déjà saisies sur des produits existants restent intactes (garanti structurellement, liaison par texte jamais par id, déjà établi par l'audit).
- La garde bloquante sur `catalogue:supprimerSousCategorie` nécessite potentiellement une nouvelle méthode de repository (`ModeleRepository.listBySousCategorie` ou équivalent) — vérifier qu'elle n'existe pas déjà sous un autre nom avant d'en créer une redondante.

### 7. Tests unitaires nécessaires
- Les 7 scénarios de l'audit complémentaire, un par un : (1) suppression catégorie avec sous-catégories actives → refusée ; (2) suppression sous-catégorie avec modèles actifs → refusée ; (3) suppression sous-catégorie avec produits (via modèles) → refusée par la même garde que (2) ; (4) suppression champ utilisé par des produits → tombstone, valeurs produits intactes ; (5) suppression champ obligatoire → confirmation exigée ; (6) suppression puis restauration sur un autre poste → sans objet (restauration hors périmètre, test de non-applicabilité) ; (7) suppression reçue avec dépendance locale → tombstone appliqué sans vérification de dépendance côté réception, badge calculé correctement.
- `delete()` de `sousCategorieChampRepository` : tombstone appliqué, champ absent de `listBySousCategorie()` après, valeur produit existante toujours lisible.

### 8. Tests d'intégration nécessaires
- Un poste B reçoit (catch-up) la suppression d'une sous-catégorie référencée par un modèle local actif → aucune exception, le modèle reste intact, le badge dérivé est correctement calculé à la lecture.
- Suppression d'un champ obligatoire sans le paramètre de confirmation → refusée côté IPC ; avec le paramètre → tombstone appliqué.

### 9. Critères précis de validation
Les 7 scénarios passent ; aucune régression sur les écrans/fonctionnalités de catalogue existantes non concernées par le badge (vérifié en limitant le diff aux fichiers listés en §3, hors investigation de recherche d'écran qui ne modifie rien).

### 10. Conditions pour passer à la sous-phase 7
Les 3 mécanismes backend (gardes, tombstone, confirmation) sont testés et verts ; l'identification des écrans pour le badge est documentée (même si son implémentation visuelle elle-même peut être une tâche encore plus fine, séparée, à l'intérieur de cette sous-phase).

---

## 7. SOUS-PHASE 7 — Rattrapage proactif

### 1. Objectif
Pousser, une seule fois par poste, l'intégralité du référentiel local déjà existant avant cette phase — **jamais activé avant que l'écran de diagnostic des doublons existe et soit disponible**, condition explicitement validée.

### 2. Périmètre exact
Un bloc de rattrapage ponctuel dans `main/index.ts`, gardé par `existeEntreePourType`, **et** l'écran de diagnostic en lecture seule (§12.3 du cahier des charges), livrés **ensemble** avant toute activation en production — le diagnostic doit exister avant le rattrapage, pas après.

### 3. Fichiers et modules concernés (vérifiés)
- `packages/electron-app/src/main/index.ts` — nouveau bloc calqué exactement sur le rattrapage compte existant (lignes 301-323 actuelles : commentaire expliquant le rattrapage ponctuel, garde `if (!boiteEnvoiRepository.existeEntreePourType("categorie"))`, boucle `for (const c of categorieRepository.list()) { enqueueCategorieSync(...) }`), à placer après l'instanciation des 4 repositories référentiels (lignes 348-351 actuelles).
- Écran de diagnostic : nouveau composant côté renderer + nouvel IPC en lecture seule (ex. `catalogue:diagnostiquerDoublonsReferentiel`), interrogeant `categorieRepository`/`sousCategorieRepository`/`modeleRepository`/`produitRepository` pour des noms identiques (insensible à la casse) à id différent — **aucune mutation**, uniquement une requête de lecture et un IPC qui la restitue.

### 4. Modifications techniques à effectuer
1. Bloc de rattrapage pour `categorie` (garde `existeEntreePourType("categorie")`), `sous_categorie` (garde séparée, `existeEntreePourType("sous_categorie")`), `sous_categorie_champ` (garde séparée) — **3 gardes indépendantes**, pas une seule garde générique, pour permettre un rattrapage partiel si l'un des 3 types échouait partiellement lors d'un déploiement antérieur (cohérent avec le fait que chaque garde est déjà indépendante pour compte/emplacement/catalogue aujourd'hui).
2. Écran/IPC de diagnostic : requête de rapprochement par nom (catégories entre elles, sous-catégories entre elles par catégorie, modèles entre eux, produits entre eux), restitution des paires candidates avec leurs id/dates/contenu.

### 5. Dépendances avec les sous-phases précédentes
Nécessite les sous-phases 3 et 4 complètes (le rattrapage réutilise les mêmes fonctions d'enfilage et le même mécanisme de catch-up).

### 6. Conditions d'exécution unique et protections contre une réexécution accidentelle
- **Garde primaire** : `boiteEnvoiRepository.existeEntreePourType(type)` — vrai dès qu'**une seule** entrée de ce type existe, quel que soit son statut (`pending`/`sent`/`confirmed`/`error`) ; donc après la toute première exécution réussie (même partiellement, même en échec réseau ultérieur), le bloc ne se redéclenche plus jamais, exactement le même comportement que pour `compte`/`emplacement` aujourd'hui.
- **Protection contre une réexécution accidentelle sur une base restaurée** (ex. restauration d'une sauvegarde antérieure à la Phase 5 sur un poste déjà migré) : la garde étant basée sur le contenu de `boite_envoi` et non sur un drapeau de version séparé, une restauration de sauvegarde antérieure à cette phase **réexécuterait légitimement** le rattrapage au redémarrage suivant — **comportement voulu et cohérent avec le principe déjà en place pour compte/emplacement** (jamais traité comme une anomalie dans ce projet), pas une faille introduite par cette phase.
- **Protection contre un double rattrapage en cas de crash pendant la boucle** : chaque `enqueueXSync()` étant une insertion indépendante (pas de transaction englobante sur toute la boucle), un crash en cours de boucle laisserait certaines entités déjà enfilées et d'autres non — **au redémarrage suivant, la garde `existeEntreePourType` serait déjà vraie** (puisqu'au moins une entrée existe) et empêcherait de rattraper les entités manquantes. **Point à corriger explicitement par rapport au patron existant** : utiliser une garde par lot complet plutôt qu'un simple booléen d'existence, ou envelopper toute la boucle dans une transaction locale (SQLite) pour que l'insertion des entrées `boite_envoi` soit elle-même atomique — **ce risque existe déjà identiquement pour compte/emplacement/catalogue dans le code actuel**, donc ce n'est pas une régression introduite ici, mais une faiblesse préexistante qu'il serait possible de corriger en même temps si on le souhaite (décision à signaler, pas à trancher dans ce plan).

### 7. Risques de régression
Aucun sur le code existant (nouveau bloc additif) — le risque principal est opérationnel (doublons, voir ci-dessous), pas technique.

### 8. Tests unitaires nécessaires
- Garde `existeEntreePourType` empêche une deuxième exécution.
- Requête de diagnostic : détecte correctement deux catégories de même nom à id différent, ne détecte rien si les noms diffèrent (y compris par la casse, qui ne doit jamais compter comme une différence).

### 9. Tests d'intégration nécessaires
- Rattrapage exécuté sur un poste avec un référentiel local non vide → toutes les entités apparaissent dans `boite_envoi`, puis sont effectivement poussées au cycle suivant.
- **Scénario réaliste à tester explicitement, découvert en §0.2 point 5** : deux postes de test, chacun ayant exécuté indépendamment `initialiserCategoriesQuincailleriePredefiniesSiAbsentes` (donc chacun avec ses propres id aléatoires pour les mêmes catégories prédéfinies) → après rattrapage proactif des deux, l'écran de diagnostic doit détecter et lister ces doublons prévisibles.

### 10. Critères précis de validation
- L'écran de diagnostic est fonctionnel et testé **avant** toute activation du rattrapage en production (ordre de livraison vérifié, pas seulement codé).
- Le rattrapage ne s'exécute qu'une fois par poste, vérifié sur redémarrage répété.
- Le scénario des catégories prédéfinies dupliquées est documenté comme résultat attendu (pas une anomalie) dans les notes de déploiement de cette sous-phase.

### 11. Conditions pour passer à la sous-phase 8
Rattrapage et diagnostic tous deux livrés et testés ; **décision opérationnelle explicite prise avec l'administrateur réel** sur le sort des doublons prévisibles des catégories prédéfinies avant toute activation en production (cette décision n'est pas technique, elle revient à l'utilisateur au moment du déploiement réel, pas à ce plan).

---

## 8. SOUS-PHASE 8 — Durcissement différé

### 1. Objectif
Traiter les chantiers de robustesse/sécurité déjà identifiés par l'audit Phase 5, qui concernent l'infrastructure de synchronisation mais ne bloquent aucune des 7 sous-phases précédentes.

### 2. Périmètre exact
5 chantiers indépendants, pouvant progresser en parallèle entre eux et par rapport aux sous-phases 1-7 une fois celles-ci entamées (mais sans dépendre de leur achèvement complet) :
1. Notification SSE immédiate pour les 3 nouveaux types référentiels.
2. Backoff réel de retry.
3. Validation de `MAXI_EQUIP_API_URL`.
4. Étude (pas implémentation) de vérification d'identité serveur.
5. Rate limiting.

### 3. Fichiers et modules concernés (vérifiés)
1. `packages/api/src/routes/v1/app/sync/push.ts` — `TYPES_AVEC_ORIGINE_POSTE` (ligne 62 actuelle) et le bloc de diffusion SSE (lignes 137-142 actuelles) : **attention, ce bloc ne s'applique aujourd'hui qu'aux types du chemin hérité (`operationsHeritees`, vente/entree/sortie/transfert), jamais aux types de projection** (`operationsCatalogue`, lignes 108-120) — étendre la notification SSE aux 3 nouveaux types référentiels nécessite d'ajouter un bloc de diffusion **dans la branche `operationsCatalogue`**, qui n'en a aujourd'hui aucune, pas seulement d'ajouter ces types à `TYPES_AVEC_ORIGINE_POSTE` (qui ne s'applique qu'à l'autre branche) — **précision technique non présente dans le cahier des charges, découverte en relisant `push.ts` intégralement pour ce plan**.
2. `packages/electron-app/src/main/repositories/boiteEnvoiRepository.ts` — `enregistrerErreur()` (lignes 157-161 actuelles).
3. `packages/electron-app/src/main/services/syncConfig.ts`.
4. Étude uniquement, aucun fichier modifié.
5. `packages/api/src/core/router.ts` (commentaire obsolète lignes 9-21 actuelles) + configuration nginx (hors dépôt applicatif, fichier de déploiement).

### 4. Modifications techniques à effectuer
1. Ajouter un bloc de diffusion SSE dans la branche `operationsCatalogue` de `push.ts`, limité aux 3 nouveaux types référentiels (ne touche jamais aux types catalogue/compte/emplacement/promotion/identité déjà en place, sauf décision ultérieure explicite de l'étendre aussi à eux).
2. Calculer un `next_attempt_at` réel dans `enregistrerErreur()` (backoff croissant, ex. exponentiel borné) — la colonne existe déjà dans le schéma, aucune migration nécessaire.
3. Avertissement explicite si `MAXI_EQUIP_API_URL` commence par `http://` hors environnement de développement.
4. Document d'étude séparé (pas de code) sur le pinning de certificat/l'empreinte de clé publique.
5. Directive `limit_req_zone` nginx et/ou garde applicative minimale ; mise à jour du commentaire obsolète de `router.ts`.

### 5. Dépendances avec les sous-phases précédentes
Le chantier 1 (SSE) dépend techniquement de la sous-phase 3 (les 3 types doivent exister dans `push.ts`). Les chantiers 2-5 sont totalement indépendants de tout le reste de la Phase 5 et pourraient même être traités avant, en parallèle, ou après — ils concernent l'infrastructure générale, pas spécifiquement le référentiel.

### 6. Risques de régression
- Chantier 1 : vérifier que l'ajout d'un bloc de diffusion dans `operationsCatalogue` ne modifie jamais le comportement des types qui y transitent déjà sans notification (ne pas notifier accidentellement pour `modele`/`produit`/`compte`/`emplacement`/`promotion`/`parametres_entreprise` si ce n'est pas explicitement demandé).
- Chantier 2 : un backoff mal calibré pourrait retarder excessivement une synchronisation légitime après une panne courte — prévoir un plafond raisonnable, pas une croissance illimitée.

### 7. Tests unitaires nécessaires
- Backoff : séquence d'échecs produit des `next_attempt_at` croissants et plafonnés.
- Validation d'URL : détection correcte de `http://` vs `https://`.

### 8. Tests d'intégration nécessaires
- SSE : une opération référentielle réellement nouvelle déclenche une notification ; un doublon (déjà traité) n'en déclenche aucune.
- Rate limiting (si implémenté applicativement) : dépassement du seuil refusé proprement.

### 9. Critères précis de validation
Chaque chantier testé indépendamment ; aucune régression sur les 7 sous-phases précédentes (ce chantier ne doit jamais être un prérequis bloquant pour elles).

### 10. Conditions de clôture
Les 5 chantiers sont indépendants — chacun peut être clos séparément sans attendre les autres. Aucune condition de passage à une sous-phase suivante : c'est la dernière.

---

## 9. Stratégie de tests — vue d'ensemble

- **Après chaque modification** (niveau fonction/méthode) : test unitaire immédiat, avant de passer à la modification suivante — jamais un lot de modifications non testées.
- **Après chaque sous-phase** : suite d'intégration complète de cette sous-phase + re-exécution de **toute** la suite existante du paquet concerné (`packages/api`, `packages/electron-app`) pour détecter une régression transverse.
- **Parité SQLite/PostgreSQL** : chaque nouvelle méthode `ServerStorage` testée sur les deux implémentations avec exactement le même scénario (patron déjà en place pour `modele`/`produit`).
- **Simulation de deux postes indépendants** : au moins un scénario par sous-phase 3/4/7, avec deux instances SQLite locales distinctes (fichiers temporaires séparés) pointant vers le même serveur de test (patron déjà utilisé pour les tests multi-postes du système de notifications, Phases E/F de ce projet).
- **Conflits LWW** : au moins un test simulant deux `updatedAt` différents pour la même entité référentielle, vérifiant que le plus récent l'emporte, y compris pour la configuration d'unités (dont le conflit porte sur l'`updatedAt` de la sous-catégorie parente, pas un `updatedAt` propre).
- **Postes déconnectés puis reconnectés** : un scénario où un poste simulé n'exécute aucun cycle de synchronisation pendant une durée simulée, puis reprend — vérifier qu'il rattrape l'état courant complet au cycle suivant sans historique à rejouer (cohérent avec le principe de relecture intégrale déjà en place).
- **Non-régression des fonctionnalités existantes** : à chaque sous-phase, re-confirmer explicitement que les tests déjà verts des phases précédentes de ce projet (notamment la suite `factureDocumentService.visuel.test.ts` et la suite complète Phase 4, totalement hors périmètre de cette phase) restent strictement inchangés.
- **Aucune donnée réelle** : tous les tests utilisent des bases SQLite temporaires et un serveur de test dédié (patron déjà systématiquement utilisé dans ce projet — `vi.mock("electron")` avec dossier temporaire, serveur de test en mémoire/SQLite éphémère côté API) — jamais la base de production, jamais une donnée client réelle.

---

## 10. Ambiguïtés restantes

1. **Méthode exacte de garde pour `catalogue:supprimerSousCategorie`** (sous-phase 6) : la méthode de repository nécessaire (`ModeleRepository.listBySousCategorie` ou équivalent) n'a pas été confirmée comme existante ou à créer — à vérifier en tout début d'exécution de la sous-phase 6, avant tout codage.
2. **Emplacement exact du badge de classification orpheline** (sous-phase 6) — explicitement laissé ouvert par le cahier des charges, une recherche d'écrans doit être menée au début de la sous-phase 6, pas avant.
3. **Syntaxe exacte de la migration idempotente PostgreSQL** pour les colonnes ajoutées (`ADD COLUMN IF NOT EXISTS` natif vs vérification manuelle via `information_schema`) — à confirmer en relisant les migrations PostgreSQL déjà existantes (si une colonne a déjà été ajoutée à une table existante par le passé côté Postgres) au début de la sous-phase 1.
4. **Protection contre un rattrapage proactif partiellement exécuté puis interrompu** (sous-phase 7, §6) — faiblesse déjà présente de façon identique pour compte/emplacement/catalogue, non corrigée par ce plan (hors périmètre strict), mais signalée comme amélioration possible à discuter.
5. **Décision opérationnelle sur les doublons prévisibles des catégories prédéfinies** (sous-phase 7) — ce n'est pas une ambiguïté technique mais une décision humaine à prendre au moment du déploiement réel, pas pendant la conception.

## 11. Dépendances critiques

- Sous-phase 1 bloque toutes les suivantes (schéma/validateurs serveur).
- Sous-phase 3 bloque la sous-phase 4 (rien à appliquer sans rien à pousser) et le chantier SSE de la sous-phase 8.
- Sous-phases 3 et 4 bloquent la sous-phase 7 (le rattrapage réutilise leurs mécanismes).
- La livraison de l'écran de diagnostic (sous-phase 7) est un **prérequis strict et non négociable** à l'activation du rattrapage proactif en production — pas seulement un ordre recommandé.
- La sous-phase 5 (complétude modèle/produit) est indépendante des sous-phases 1-4/6/7 sur le plan du code, mais partage les mêmes fichiers serveur (`validationCatalogueSync.ts`, `sqliteServerStorage.ts`, `postgresServerStorage.ts`) — à séquencer pour éviter des conflits d'édition si plusieurs sous-phases sont menées en parallèle par des personnes différentes.

## 12. Critères de validation globaux de la Phase 5

- Deux postes de test, partant chacun d'un référentiel local différent, convergent vers un état identique après rattrapage proactif + quelques cycles de synchronisation (hors doublons prédéfinis, traités séparément).
- Aucune régression sur : le chemin vente/mouvement (journal immuable), le catalogue produit/modèle existant pour sa partie déjà en production avant cette phase, la génération de documents PDF (Phase 4), le système de notifications SSE existant (Phases E/F).
- Les 7 scénarios de suppression de l'audit complémentaire passent tous.
- L'écran de diagnostic des doublons est fonctionnel et a été utilisé au moins une fois en conditions réalistes (deux bases de test avec catégories prédéfinies dupliquées) avant toute activation en production.
- Parité SQLite/PostgreSQL confirmée sur l'ensemble des nouvelles méthodes `ServerStorage`.

## 13. Fichiers à surveiller pour éviter toute modification hors périmètre

- `packages/electron-app/src/renderer/app/screens/VentesScreen.tsx` — jamais touché.
- `packages/electron-app/src/main/services/documentInterneDocumentService.ts` — jamais touché.
- `packages/electron-app/src/main/services/factureDocumentService.ts` et sa suite de tests (Phase 4, déjà livrée) — jamais touché par cette phase.
- `packages/site/**` — jamais touché (le référentiel n'est jamais exposé au site public).
- Tout fichier lié à Multipost ou à la sauvegarde/backup — jamais touché.
- `packages/api/src/routes/v1/app/sync/push.ts`, lignes du bloc `operationsHeritees`/`enregistrerOperations` (chemin vente/mouvement) — seules les listes `TYPES_PROJECTION`/`TYPES_AVEC_ORIGINE_POSTE` et les branches de dispatch catalogue doivent s'allonger ; le reste de ce fichier est une zone à surveiller strictement pour toute modification non liée au référentiel.
- `packages/api/src/core/publicCatalog.ts` — à surveiller spécifiquement : aucune des 3 nouvelles tables de projection ni aucun des 5 nouveaux champs modèle/produit ne doit y apparaître sans une décision explicite séparée (cf. cahier des charges, exposition publique hors périmètre de cette phase).

---

**Aucune implémentation n'a commencé. En attente de validation avant toute exécution d'une sous-phase.**
