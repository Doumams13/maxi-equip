# PHASE 5 — CAHIER DES CHARGES TECHNIQUE : SYNCHRONISATION SERVEUR

**Statut : document de conception. Aucune implémentation n'a commencé.**

Ce document consolide trois travaux déjà réalisés en lecture seule :
1. **Phase 5 — Audit de l'existant** (architecture de synchronisation actuelle).
2. **Phase 5.2 — Étude technique** (référentiel commun du catalogue, comparaison d'architectures).
3. **Phase 5.2 — Audit complémentaire** (isolation par entreprise, versionnement des unités, protection des suppressions).

### Légende utilisée dans tout le document

- **[VALIDÉ]** — décision métier ou technique déjà actée par l'utilisateur, non remise en question ici.
- **[PROPOSITION]** — recommandation technique découlant des audits, à valider avant implémentation.
- **[À VALIDER]** — point explicitement laissé ouvert, nécessitant une décision humaine avant de coder.
- **[⚠ POINT D'ATTENTION]** — tension ou ambiguïté réelle repérée entre deux décisions déjà validées, signalée sans trancher à la place de l'utilisateur.

---

## 1. Objectifs et périmètre de la Phase 5

### 1.1 Objectif métier **[VALIDÉ]**

Garantir que tous les postes MAXI EQUIP d'une même entreprise partagent un référentiel de catalogue cohérent (catégories, sous-catégories, configurations, champs/caractéristiques, unités autorisées, métadonnées), tout en conservant à chaque poste la capacité de fonctionner hors connexion.

### 1.2 Architecture retenue **[VALIDÉ]**

**Option A** : SQLite reste la source de vérité métier locale ; chaque poste continue de fonctionner hors ligne ; les modifications sont répliquées vers PostgreSQL selon le mécanisme de projection LWW (*Last-Write-Wins*) déjà existant, étendu plutôt que remplacé.

### 1.3 Isolation par entreprise **[VALIDÉ]**

Isolation **infrastructurelle**, jamais applicative : un déploiement serveur/API/base de données complet par entreprise. Aucune colonne `entreprise_id` n'est ajoutée à aucune nouvelle table de cette phase — cohérent avec l'intégralité du schéma existant (`postes`, `comptes_utilisateurs`, `emplacements`, `identite_entreprise` n'en possèdent aucune, et `identite_entreprise` est un singleton contraint par SQL : `id TEXT PRIMARY KEY CHECK (id = 'singleton')`, `postgresServerStorage.ts:136-145`). La configuration réseau de chaque poste doit cependant être sécurisée pour éviter qu'il communique accidentellement avec le mauvais serveur (détaillé en §11).

### 1.4 Hors périmètre — rappel des contraintes permanentes du projet

Conformément aux règles déjà en vigueur dans l'ensemble des phases MAXI EQUIP :
- **Jamais de modification** de l'écran Ventes (`VentesScreen.tsx`), du document interne (`documentInterneDocumentService.ts`), du site public, de Multipost, ou de la sauvegarde/backup — chantiers distincts, non concernés par cette phase.
- Aucun commit, push ou déploiement ne sera effectué sans validation explicite préalable.
- Aucune donnée fictive n'est introduite dans un environnement réel.

### 1.5 Dans le périmètre

- Synchronisation des entités `categories`, `sous_categories`, `sous_categorie_champs`, et de la configuration des unités autorisées (`sous_categorie_unites`) — cette dernière n'est **jamais une entité synchronisée indépendamment** : c'est une configuration de la sous-catégorie, transportée comme sous-objet de son payload (§4.6/§7.3).
- Complétude des payloads déjà synchronisés `modele`/`produit` (champs manquants identifiés par l'audit).
- Gestion des suppressions pour ces entités.
- Durcissement de la robustesse réseau et de la sécurité déjà identifiés par l'audit Phase 5, dans la mesure où ils concernent directement ce même mécanisme de synchronisation.

---

## 2. Architecture existante et architecture cible

### 2.1 Mécanismes existants (vérifiés en lecture seule)

| Mécanisme | Entités concernées | Principe | Références |
|---|---|---|---|
| Journal immuable, rejouable par curseur | `vente`, `annulation`, `entree`, `sortie`, `transfert`, `demande` | `INSERT OR IGNORE` sur `UNIQUE(entity_type, entity_id)` ; `GET /v1/sync/pull?since=<curseur>` ; aucune résolution de conflit (commentaire explicite `pull.ts:13-16`) | `routes/v1/app/sync/push.ts`, `pull.ts` |
| Projection mutable, LWW sur `updatedAt` | `modele`, `produit`, `promotion`, `compte`, `emplacement`, `parametres_entreprise` | `INSERT ... ON CONFLICT(id) DO UPDATE ... WHERE excluded.updated_at >= table.updated_at` (`sqliteServerStorage.ts:255-290`, miroir Postgres) ; catch-up par relecture intégrale | `catalogStore.ts`, `validationCatalogueSync.ts`, `catalogueSyncService.ts` |
| File d'attente locale | Toutes les entités ci-dessus | `boite_envoi` (`id, entity_type, entity_id, payload_json, status, attempts, next_attempt_at, last_error`) — `creer()`/`enregistrerErreur()`, **aucun backoff réel** (`boiteEnvoiRepository.ts:150-161`) | `boiteEnvoiRepository.ts` |

**Point capital déjà établi par l'étude Phase 5.2** : la projection `catalogue_modeles`/`catalogue_produits` est **la même table** qui alimente à la fois le site public (`publicCatalog.ts`) et le catch-up inter-postes (`GET /v1/app/catalogue/list`) — pas deux mécanismes séparés. Garantie structurelle documentée (`catalogStore.ts:69-74`) : aucune colonne de stock/coût/fournisseur n'existe dans ces tables.

**Découverte complémentaire à noter ici** : le schéma PostgreSQL actuel de `catalogue_produits` possède **déjà** les colonnes `unite_vente TEXT` et `caracteristiques TEXT`, posées par anticipation mais **jamais câblées** (commentaire explicite, `postgresServerStorage.ts:93-99` : *« colonnes posées au niveau schéma seulement, jamais encore écrites [...] le câblage de la validation/synchro est une phase ultérieure, volontairement hors périmètre »*). **Cette phase ultérieure, c'est la Phase 5 actuelle** — ces deux colonnes n'ont donc pas besoin d'être créées par migration, seulement câblées (validateur + `appliquerOperationProduit` + push client).

### 2.2 Architecture cible **[VALIDÉ]**

Étendre le mécanisme de projection LWW existant (colonne du milieu du tableau ci-dessus) au référentiel de classification, sur deux niveaux distincts :

- **3 nouvelles tables de projection dédiées**, distinctes de `catalogue_modeles`/`catalogue_produits` :
  - `catalogue_categories`
  - `catalogue_sous_categories`
  - `catalogue_sous_categorie_champs`
- **1 configuration transportée comme sous-objet**, jamais comme table indépendante : les unités autorisées (`sous_categorie_unites` côté client) sont une colonne JSON de `catalogue_sous_categories`, versionnée avec la sous-catégorie elle-même (détail en §4.6/§7.3).

Et compléter les payloads déjà existants de `modele`/`produit` avec les champs manquants identifiés (§8).

**Aucun changement** n'est apporté au journal immuable (vente/mouvements) ni à son mécanisme d'idempotence — l'extension se fait exclusivement sur le chemin « projection », déjà conçu pour cela.

---

## 3. Modifications nécessaires côté SQLite (client)

| # | Composant | Comportement actuel | Comportement attendu | Fichiers concernés | Dépendances | Tests nécessaires |
|---|---|---|---|---|---|---|
| 3.1 | `categories` | Déjà `id, nom, image_data_url, ordre, deleted_at, deleted_by, created_at, updated_at` — compatible tel quel | Aucun changement de schéma nécessaire | `migrate.ts` (schéma déjà posé, lignes 316-328) | — | — |
| 3.2 | `sous_categories` | Déjà `id, categorie_id, nom, ordre, modele_physique, unites_configurees, deleted_at, deleted_by, created_at, updated_at` — compatible tel quel | Aucun changement de schéma nécessaire | `migrate.ts:330-341`, `421-429` | — | — |
| 3.3 | `sous_categorie_champs` | **Suppression physique** (`DELETE FROM`, `sousCategorieChampRepository.ts:134-136`), aucune colonne `deleted_at` | Ajouter `deleted_at TEXT`, `deleted_by TEXT` — passer `delete()` en tombstone (**[VALIDÉ]**, §9) | `migrate.ts` (nouvelle fonction `ajouterColonnesDeletedChampsSiAbsentes`), `sousCategorieChampRepository.ts` | **Changement de comportement, pas seulement additif** : `listBySousCategorie()`/`listGroupesParSousCategorie()` doivent ajouter `WHERE deleted_at IS NULL` | Test de non-régression : un champ tombstoné disparaît des listes mais une valeur produit déjà saisie avec cette clé reste intacte |
| 3.4 | `sous_categorie_unites` | Table de jointure pure (`sous_categorie_id, unite_vente`), aucun `id`/`updated_at` propre ; remplacement intégral (`DELETE` + `INSERT`) versionné par `sous_categories.updated_at` | Aucun changement de schéma — répliquée comme sous-objet du payload `sous_categorie` (**[VALIDÉ]**, §7), pas comme entité indépendante | `sousCategorieUniteRepository.ts` (inchangé structurellement) | §7 (câblage du push) | Test que `definir()`/`reinitialiser()` déclenchent bien l'enfilage de synchronisation de la sous-catégorie parente |
| 3.5 | `modeles_produit` | `sous_categorie_id`, `marque` déjà présentes en colonnes (`migrate.ts:352-356`, `531-534`) mais jamais poussées (`enqueueModeleSync`, `ipc/metier.ts:1581-1589`) | Aucun changement de schéma — seul le payload poussé change (§8) | `ipc/metier.ts` | — | Voir §8 |
| 3.6 | `produits` | `unite_vente`, `caracteristiques`, `marque` déjà présentes en colonnes (`migrate.ts:290-297`, `539-543`) mais jamais poussées (`enqueueProduitSync`, `ipc/metier.ts:1592-1611`) | Idem | `ipc/metier.ts` | — | Voir §8 |
| 3.7 | Nouvelles méthodes `creerDepuisServeur()` | Absentes pour `categorieRepository`/`sousCategorieRepository`/`sousCategorieChampRepository` | Ajouter, calquées sur `ModeleRepository.creerDepuisServeur` (`modeleRepository.ts:71-86`) : id serveur conservé tel quel, upsert local inconditionnel (le serveur a déjà résolu le conflit LWW). **`SousCategorieRepository.creerDepuisServeur()` applique en plus, dans la même opération, la configuration d'unités reçue en sous-objet (§4.6/§7.3) en appelant `sousCategorieUniteRepository.definir()` en interne — `SousCategorieUniteRepository` n'a ni méthode `creerDepuisServeur()` propre, ni point d'entrée de catch-up indépendant**, cohérent avec le fait que les unités ne sont jamais synchronisées comme une entité à part | 3 fichiers `*Repository.ts` (`categorieRepository.ts`, `sousCategorieRepository.ts`, `sousCategorieChampRepository.ts`) | §4/§5 (forme exacte du payload de catch-up) | Tests unitaires par repository : création si absent, mise à jour si id déjà présent, jamais de doublon ; test spécifique que `SousCategorieRepository.creerDepuisServeur()` applique correctement la configuration d'unités reçue |

---

## 4. Modifications nécessaires côté PostgreSQL (serveur)

| # | Composant | Comportement actuel | Comportement attendu | Fichiers / migrations concernés | Tests nécessaires |
|---|---|---|---|---|---|
| 4.1 | `catalogue_produits.unite_vente`/`caracteristiques` | Colonnes déjà présentes, jamais écrites (§2.1) | Câbler en écriture (pas de migration de schéma nécessaire) | `postgresServerStorage.ts` (méthode `appliquerOperationProduit`), `sqliteServerStorage.ts` (miroir dev) | Test d'upsert avec ces champs renseignés |
| 4.2 | `catalogue_modeles.sous_categorie_id`/`marque` | Colonnes **absentes** (vérifié : `catalogue_modeles` ne contient que `id, motif, type, slug, ordre_vitrine, deleted_at, updated_at`) | **[VALIDÉ]** Ajouter ces 2 colonnes par migration | `postgresServerStorage.ts` (CREATE TABLE + migration idempotente type `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, cohérent avec le style déjà utilisé côté SQLite), `sqliteServerStorage.ts` | Test de migration idempotente (exécutable plusieurs fois sans erreur), test d'upsert avec ces champs |
| 4.2 bis | `catalogue_produits.marque` | Colonne **absente, confirmé** (vérifié : `catalogue_produits` ne contient que `id, modele_id, taille, taille_tri, largeur, hauteur, reference, prix, unite_vente, caracteristiques, deleted_at, updated_at`) | **[VALIDÉ]** Ajouter cette colonne par migration idempotente, compatible avec les données existantes (`NULL` par défaut, aucune donnée historique affectée) ; câbler ensuite dans la validation du payload produit (§5.1), l'application de l'opération côté serveur (§8.2), le push depuis le poste client (§8.2) et le catch-up vers les autres postes (§8.2) — parité stricte à vérifier entre `postgresServerStorage.ts` et `sqliteServerStorage.ts`, comme pour toutes les colonnes de projection existantes | `postgresServerStorage.ts`, `sqliteServerStorage.ts` | Test de migration idempotente, test d'upsert avec ce champ renseigné, test de parité SQLite/PostgreSQL |
| 4.3 | `catalogue_categories` (nouvelle table) | Inexistante | **[VALIDÉ]** Créer : `id TEXT PRIMARY KEY, nom TEXT NOT NULL, image_data_url TEXT, ordre INTEGER, deleted_at TEXT, deleted_by TEXT, updated_at TEXT NOT NULL` — miroir du schéma local, jamais exposée via `publicCatalog.ts` | `postgresServerStorage.ts`, `sqliteServerStorage.ts` | Test d'upsert LWW, test d'absence totale dans les DTO publics |
| 4.4 | `catalogue_sous_categories` (nouvelle table) | Inexistante | **[VALIDÉ]** Créer : `id TEXT PRIMARY KEY, categorie_id TEXT NOT NULL, nom TEXT NOT NULL, ordre INTEGER, modele_physique TEXT, deleted_at TEXT, deleted_by TEXT, updated_at TEXT NOT NULL` | Idem | Idem + test que `categorie_id` pointant vers une catégorie absente côté serveur ne provoque jamais d'exception (cohérent avec la tolérance FK déjà pratiquée pour `vente`/`mouvement`, voir §10) |
| 4.5 | `catalogue_sous_categorie_champs` (nouvelle table) | Inexistante | **[VALIDÉ]** Créer : `id TEXT PRIMARY KEY, sous_categorie_id TEXT NOT NULL, nom TEXT NOT NULL, type TEXT NOT NULL, obligatoire BOOLEAN, valeurs_autorisees TEXT, unite_mesure TEXT, role TEXT, ordre INTEGER, deleted_at TEXT, deleted_by TEXT, updated_at TEXT NOT NULL` — **tombstone dès la conception serveur**, cohérent avec §3.3/§9 | Idem | Idem |
| 4.6 | Configuration des unités autorisées (périmètre fonctionnel nommé `catalogue_sous_categorie_unites`, §1.5) | Inexistante | **[VALIDÉ — décision définitive]** Aucune table séparée côté serveur : la liste d'unités autorisées est une **colonne JSON** du payload `sous_categorie`, stockée directement dans `catalogue_sous_categories` (ex. colonne `unites_autorisees TEXT`), jamais une table relationnelle distincte — cohérent avec le fait que la table locale `sous_categorie_unites` n'a elle-même ni `id` ni `updated_at` propre, et que son mode d'écriture local est déjà un remplacement intégral | `postgresServerStorage.ts` (colonne supplémentaire sur `catalogue_sous_categories`), `sqliteServerStorage.ts` (miroir dev) | Test que la configuration complète des unités survit à un aller-retour push → pull |
| 4.7 | Index | — | `updated_at` indexé sur les 3 nouvelles tables (cohérent avec `idx_modeles_produit_updated_at`, `idx_produits_updated_at` déjà existants) — la configuration d'unités est couverte par l'index de `catalogue_sous_categories`, aucun index séparé nécessaire | Idem | — |

---

## 5. Modifications nécessaires côté API

| # | Composant | Comportement actuel | Comportement attendu | Fichiers concernés | Tests nécessaires |
|---|---|---|---|---|---|
| 5.1 | Validateurs | `validerOperationModele`/`validerOperationProduit` (`validationCatalogueSync.ts:79-105`) n'incluent pas les champs manquants ; aucun validateur pour les 3 nouvelles entités | Étendre les 2 validateurs existants ; créer `validerOperationCategorie`, `validerOperationSousCategorie`, `validerOperationSousCategorieChamp` — les unités autorisées ne nécessitent pas de validateur séparé, elles sont un champ du validateur sous-catégorie (§4.6) | `validationCatalogueSync.ts` | Tests de validation stricte (rejet des payloads malformés), même rigueur que les validateurs existants |
| 5.2 | Interface `ServerStorage` + implémentations | Pas de méthode pour les 3 nouvelles entités | Ajouter `appliquerOperationCategorie`/`appliquerOperationSousCategorie`/`appliquerOperationSousCategorieChamp` + `listerCategoriesActives`/`listerSousCategoriesActives`/`listerSousCategorieChampsActifs` à l'interface, implémentées dans `sqliteServerStorage.ts` **et** `postgresServerStorage.ts` (parité stricte déjà pratiquée pour les 5 types existants) | `serverStorage.ts`, `sqliteServerStorage.ts`, `postgresServerStorage.ts` | Tests d'upsert LWW identiques pour les deux implémentations (patron déjà utilisé) |
| 5.3 | Routage `push.ts` | `TYPES_PROJECTION = new Set(["modele", "produit", "promotion", "parametres_entreprise", "compte", "emplacement"])` (`push.ts:48-49`) | Étendre à `"categorie"`, `"sous_categorie"`, `"sous_categorie_champ"` — **zéro changement** sur le chemin hérité (vente/mouvements), par construction du routage déjà en place | `push.ts` | Test que le routage héritée (vente/mouvement) reste bit-à-bit inchangé après extension |
| 5.4 | Route de lecture (catch-up) | `GET /v1/app/catalogue/list` ne renvoie que `modeles`/`produits` | **[VALIDÉ]** Nouvel endpoint dédié `GET /v1/app/referentiel/list`, renvoyant `{ categories, sousCategories, sousCategorieChamps }` en un seul aller-retour (même principe que l'endpoint existant pour modèle+produit) | Nouveau fichier `routes/v1/app/referentiel/list.ts`, câblé dans `index.ts` | Test d'intégration : lecture après plusieurs push, vérifie la cohérence des 3 listes |
| 5.5 | Notification SSE | `TYPES_AVEC_ORIGINE_POSTE` (`push.ts:62`) ne couvre que `vente/entree/sortie/transfert` — les entités de projection (dont le futur référentiel) ne déclenchent **aucune** notification immédiate, seulement le cycle périodique de 5 minutes | **[PROPOSITION]** Étendre la diffusion SSE existante (`posteEventBus.diffuser(...)`, `push.ts:137-142`) aux 3 nouveaux types — extension triviale de la liste déjà existante, aucune nouvelle infrastructure | `push.ts` | Test que la notification SSE est bien émise pour une opération référentielle réellement nouvelle, jamais pour un doublon |

---

## 6. Modifications nécessaires côté Electron et IPC

| # | Composant | Comportement actuel | Comportement attendu | Fichiers concernés | Tests nécessaires |
|---|---|---|---|---|---|
| 6.1 | `TypeOperationBoiteEnvoi` | N'inclut pas `categorie`/`sous_categorie`/`sous_categorie_champ` (`boiteEnvoiRepository.ts:25-49`) | Ajouter ces 3 types | `boiteEnvoiRepository.ts` | — |
| 6.2 | Fonctions d'enfilage | `enqueueModeleSync`/`enqueueProduitSync` existent (`ipc/metier.ts:1581-1612`) et doivent être étendues ; aucune fonction équivalente pour les 3 nouvelles entités | Créer `enqueueCategorieSync`, `enqueueSousCategorieSync`, `enqueueSousCategorieChampSync` (même patron exact : payload construit champ par champ, `boiteEnvoiRepository.creer(...)`) | `ipc/metier.ts` | Tests unitaires par fonction (payload correctement formé) |
| 6.3 | Câblage dans les gestionnaires IPC existants | `catalogue:creerCategorie`/`modifierCategorie`/`supprimerCategorie`, `catalogue:creerSousCategorie`/`modifierSousCategorie`/`supprimerSousCategorie`, `catalogue:creerChampSousCategorie`/`modifierChampSousCategorie`/`supprimerChampSousCategorie` n'appellent aucune fonction d'enfilage | Ajouter l'appel d'enfilage approprié dans chacun de ces 9 gestionnaires | `ipc/metier.ts` (lignes 390-488 pour les gestionnaires catégorie/sous-catégorie/champs déjà identifiés) | Test d'intégration par gestionnaire : l'action locale dépose bien une entrée dans `boite_envoi` |
| 6.4 | **Câblage des gestionnaires "unités"** — point de rupture identifié par l'audit complémentaire | `catalogue:definirUnitesSousCategorie`/`catalogue:reinitialiserUnitesSousCategorie` (`ipc/metier.ts:501-515`) sont **séparés** des gestionnaires "sous-catégorie" ci-dessus (fichier différent de repository, emplacement différent dans `metier.ts`) — risque concret d'oubli si le câblage de 6.3 est fait par analogie sans traiter spécifiquement ces 2 handlers | **[VALIDÉ — exigence technique, pas une décision métier ouverte]** Le câblage de ces 2 gestionnaires DOIT être traité comme une tâche explicite et distincte de 6.3, pas supposé couvert par elle. La fonction `enqueueSousCategorieSync` doit être appelée ici aussi, avec la **sous-catégorie parente entière** (incluant sa configuration d'unités à jour, cf. §7) comme payload — puisque `sous_categories.updated_at` est déjà correctement actualisé par `definir()`/`reinitialiser()` (`sousCategorieUniteRepository.ts:52-77`) | `ipc/metier.ts:501-515` | **Test de non-régression spécifique** : modifier UNIQUEMENT les unités autorisées (sans toucher nom/ordre) déclenche bien un enfilage de synchronisation — ce test doit exister séparément du test générique de 6.3, précisément parce que c'est le point de rupture identifié |
| 6.5 | Gardes de suppression | Aucune vérification de dépendance dans `catalogue:supprimerCategorie`/`supprimerSousCategorie`/`supprimerChampSousCategorie` (`ipc/metier.ts:390-396`, `418-424`, `484-488`) | **[VALIDÉ]** Ajouter les vérifications bloquantes (§9) | Idem | Tests des 7 scénarios de suppression détaillés en §9 |
| 6.6 | Rattrapage catch-up côté client | `CatalogueSyncService` existe pour `modele`/`produit` ; aucun service équivalent pour le référentiel | **[PROPOSITION]** Nouveau `ReferentielSyncService`, même patron exact (`recupererReferentiel()` → `GET /v1/app/referentiel/list`), câblé dans le cycle périodique de `SyncService` (`main/index.ts`, intervalle de 5 minutes déjà existant) | Nouveau fichier `services/referentielSyncService.ts`, `syncService.ts`, `main/index.ts` | Tests unitaires du service (succès/échec réseau), test d'intégration du cycle complet |

---

## 7. Synchronisation du référentiel

### 7.1 Entités concernées **[VALIDÉ]**

Catégories, sous-catégories, configurations des sous-catégories (modèle physique, unités autorisées), champs et caractéristiques (nom, type, obligatoire, valeurs autorisées, unité de mesure, rôle), métadonnées de classification.

### 7.2 Flux de synchronisation cible

1. **Push** : une création/modification/suppression sur `categorieRepository`/`sousCategorieRepository`/`sousCategorieChampRepository`/`sousCategorieUniteRepository` déclenche l'enfilage correspondant (§6.2-6.4) dans `boite_envoi`, envoyé par le cycle existant de `SyncService.effectuerPush()` vers `POST /v1/sync/push`, routé vers la projection (§5.3).
2. **Application serveur** : upsert LWW conditionné par `updatedAt` (§5.2), dans les 3 nouvelles tables de projection — jamais dans `catalogue_modeles`/`catalogue_produits`, jamais exposé au site public.
3. **Catch-up** : chaque poste relit intégralement `GET /v1/app/referentiel/list` à chaque cycle (§5.4), applique via `creerDepuisServeur()` (§3.7) sur les 3 repositories concernés — `SousCategorieRepository.creerDepuisServeur()` appliquant en plus la configuration d'unités reçue en sous-objet, sans point d'entrée séparé pour celle-ci.

### 7.3 Versionnement des unités autorisées **[VALIDÉ]**

Les unités autorisées sont transmises comme **sous-objet du payload `sous_categorie`** (pas une entité séparée côté synchronisation), leur versionnement repose sur `sous_categories.updated_at`. Conséquence directe déjà vérifiée dans le code : `SousCategorieUniteRepository.definir()`/`reinitialiser()` actualisent correctement cet horodatage (lignes 59 et 74) — **la seule pièce manquante est le déclenchement de l'enfilage au niveau IPC**, précisément isolé en §6.4.

### 7.4 Compatibilité avec les données historiques **[VALIDÉ, à respecter explicitement]**

Toute sous-catégorie/catégorie/champ créé avant cette phase doit être pris en charge par le **rattrapage proactif** (§12), jamais perdu silencieusement. Une sous-catégorie sans configuration d'unités explicite (`unites_configurees = 0`) continue de proposer les 6 unités par défaut, comportement local déjà en vigueur et **non modifié** par la synchronisation.

---

## 8. Synchronisation des modèles et produits

### 8.1 Champs à ajouter **[VALIDÉ]**

| Entité | Champs manquants aujourd'hui | Déjà en colonne locale ? | Déjà en colonne serveur ? |
|---|---|---|---|
| `modele` | `sousCategorieId`, `marque` | Oui (`modeles_produit.sous_categorie_id`/`marque`) | **Non** — à créer (§4.2) |
| `produit` | `uniteVente`, `caracteristiques`, `marque` | Oui (`produits.unite_vente`/`caracteristiques`/`marque`) | `unite_vente`/`caracteristiques` : **déjà présentes mais dormantes** (§2.1/§4.1) ; `marque` : **absente, confirmé** — migration prévue en §4.2 bis |

### 8.2 Modifications précises

- `enqueueModeleSync()` (`ipc/metier.ts:1581-1589`) : ajouter `sousCategorieId: modele.sousCategorieId, marque: modele.marque` au payload.
- `enqueueProduitSync()` (`ipc/metier.ts:1592-1611`) : ajouter `uniteVente: produit.uniteVente, caracteristiques: produit.caracteristiques, marque: produit.marque`.
- `validerOperationModele`/`validerOperationProduit` (`validationCatalogueSync.ts:79-105`) : accepter et valider ces champs (types déjà connus : `UniteVente` enum, `caracteristiques` chaîne JSON déjà validée par ailleurs dans le projet, cf. `caracteristiques.ts`).
- `appliquerOperationModele`/`appliquerOperationProduit` (`sqliteServerStorage.ts`/`postgresServerStorage.ts`) : étendre les colonnes de l'`UPSERT` existant.
- `ModeleCatalogueCatchup`/`ProduitCatalogueCatchup` (`catalogueSyncService.ts:5-21`) : étendre ces interfaces et le retour de la route `/v1/app/catalogue/list` pour restituer ces champs au catch-up — **nécessaire pour que le catalogue soit reconstructible correctement sur un autre poste**, conformément à la demande explicite du §4 du cahier des charges.
- `ModeleRepository.creerDepuisServeur`/équivalent produit : étendre pour écrire ces champs à la réception.

### 8.3 Préservation de la catégorie/sous-catégorie **[VALIDÉ]**

Le payload `produit` ne porte pas directement de référence à la catégorie (celle-ci transite par `modele.sousCategorieId`, déjà dénormalisée dans le schéma local). Aucune duplication de cette information n'est nécessaire côté `produit` — un produit retrouve sa classification via son `modele_id` déjà transmis.

### 8.4 Compatibilité avec les données historiques **[VALIDÉ, à respecter explicitement]**

- `sousCategorieId`/`marque` (modèle) et `uniteVente`/`caracteristiques`/`marque` (produit) sont **tous nullable** aujourd'hui, localement comme côté serveur (§4). Un modèle/produit créé avant cette phase, jamais mis à jour depuis, continue de transiter avec ces champs à `null` — comportement déjà éprouvé pour `uniteVenteEffective()` (traite `null` comme « carton », comportement historique, confirmé par les tests de la Phase 4 de ce projet).
- **Aucune migration de données rétroactive** n'est nécessaire sur ces colonnes : elles sont déjà présentes localement, seule leur transmission change.

---

## 9. Gestion des suppressions

### 9.1 Règles validées **[VALIDÉ]**

| Entité | Règle |
|---|---|
| Catégorie | Suppression **interdite** tant qu'elle possède des sous-catégories actives (`deleted_at IS NULL`) |
| Sous-catégorie | Suppression **interdite** tant qu'elle possède des modèles actifs (`deleted_at IS NULL`) |
| Champ de caractéristique | Suppression autorisée, mais **tombstone** (`deleted_at`/`deleted_by`), jamais physique — valeurs déjà saisies sur des produits **conservées** (déjà garanti structurellement : liaison par texte, jamais par id, cf. `fusionnerCaracteristiquesSuggerees`, aucune FK à casser) |
| Champ obligatoire | Même règle de tombstone, **plus** un avertissement explicite et une confirmation supplémentaire côté IHM avant suppression |
| — | **Aucun mécanisme de suppression en cascade** pour ces entités (catégorie, sous-catégorie, champ) — voir §9.3 pour la portée exacte de cette règle |
| — | La **restauration** d'éléments supprimés est hors périmètre de cette phase |

### 9.2 Modifications précises à apporter

| Gestionnaire | Comportement actuel | Comportement attendu |
|---|---|---|
| `catalogue:supprimerCategorie` (`ipc/metier.ts:390-396`) | `softDelete()` inconditionnel | Vérifier `sousCategorieRepository.listByCategorie(id)` (déjà filtré `deleted_at IS NULL`) avant d'autoriser ; retourner `{ success: false, message: "..." }` sinon |
| `catalogue:supprimerSousCategorie` (`ipc/metier.ts:418-424`) | `softDelete()` inconditionnel | Vérifier qu'aucun modèle actif ne référence cette sous-catégorie (`modeles_produit.sous_categorie_id = ? AND deleted_at IS NULL`) avant d'autoriser |
| `catalogue:supprimerChampSousCategorie` (`ipc/metier.ts:484-488`) | `DELETE FROM` physique | Remplacer par `UPDATE ... SET deleted_at = ?, deleted_by = ?` (§3.3) ; si `obligatoire = 1`, exiger un paramètre de confirmation explicite (**le mécanisme précis d'IHM — dialogue, double confirmation — reste à concevoir, hors périmètre technique de ce cahier des charges**) |

### 9.3 Portée de la règle « aucune cascade » **[VALIDÉ]**

La règle « aucune suppression en cascade » introduite par cette phase s'applique **exclusivement** aux 3 entités du référentiel de classification nouvellement synchronisées (catégorie, sous-catégorie, champ de caractéristique). Elle ne modifie ni ne remet en cause le comportement de cascade déjà existant et en production pour la suppression d'un modèle et de ses produits (`catalogue:supprimerModele`, `ipc/metier.ts:266-283`), qui reste **strictement inchangé** par cette phase.

Les deux règles coexistent délibérément, sans contradiction : le référentiel de classification est une métadonnée partagée à fort rayon d'impact une fois répliquée entre postes (une seule catégorie peut regrouper un nombre arbitrairement grand de sous-catégories/modèles/produits à l'échelle de toute l'entreprise) — un blocage explicite y protège contre une suppression accidentelle de grande ampleur. Le catalogue commercial (modèle/produit) est une unité de gestion plus étroite, déjà protégée par un nettoyage de stock préalable (`stockService.ecoulerStockPourSuppression`) avant toute cascade — ce qui est précisément ce qui la rend sûre.

### 9.4 Application des suppressions reçues côté poste destinataire **[VALIDÉ]**

Objectif : qu'un poste recevant une suppression (catch-up) ne crashe jamais, ne perde jamais de données locales, et ne laisse jamais une référence orpheline **silencieuse** (c'est-à-dire invisible de l'utilisateur).

Constat technique déjà établi (audit complémentaire) : `findById()` ne filtre jamais `deleted_at` (`categorieRepository.ts:43-46` et équivalents), donc une entité tombstonée reste résolvable par id sans exception — une référence orpheline ne provoque **jamais de crash** avec l'architecture actuelle.

**Comportement retenu : un badge visible, jamais un blocage, jamais une suppression automatique.**

1. `creerDepuisServeur()` applique la suppression reçue (tombstone local) **sans jamais vérifier de dépendance** — la vérification de dépendance (§9.2) n'a de sens qu'au moment de la **décision locale** de supprimer, pas à la réception d'une suppression déjà décidée ailleurs (le poste source a déjà fait cette vérification avant de pousser).
2. Le modèle (ou produit) référençant une catégorie/sous-catégorie reçue comme supprimée **n'est jamais lui-même supprimé ou modifié automatiquement** — il reste intact, avec sa référence devenue orpheline.
3. **Aucune autre opération sur ce modèle/produit n'est bloquée** — prix, stock, variantes, vente : toutes les actions indépendantes du classement restent possibles.
4. L'anomalie de classification doit être **rendue clairement visible** à l'utilisateur via un badge — calculé **sans nouvelle colonne**, par simple dérivation à la lecture (ex. `LEFT JOIN` vers `sous_categories`/`categories` pour vérifier `deleted_at IS NOT NULL`), cohérent avec le principe déjà en vigueur dans ce projet de ne jamais dupliquer une donnée dérivable.
5. **Aucune modification n'est introduite dans les écrans non concernés** par cette anomalie — le badge n'apparaît que là où la classification d'un modèle/produit est déjà affichée.
6. **[À VALIDER pendant la planification technique]** L'emplacement exact du badge (liste des modèles, formulaire de modèle, fiche produit...) sera précisé après identification précise des écrans concernés — ce document n'en décide pas la forme visuelle.

---

## 10. Gestion des conflits et stratégie LWW

### 10.1 Mécanisme existant, étendu sans modification de principe **[VALIDÉ]**

`ON CONFLICT(id) DO UPDATE ... WHERE excluded.updated_at >= table.updated_at` — identique pour les 3 nouvelles entités (et pour la configuration d'unités transportée en sous-objet), aucune nouvelle logique de fusion introduite (cohérent avec le refus explicite de l'Option C — journal avec fusion champ par champ — déjà écarté par l'étude Phase 5.2).

### 10.2 Risque déjà identifié : horloge client non vérifiée **[PROPOSITION, à valider]**

`updatedAt` est fourni par le poste émetteur, sans borne de plausibilité côté serveur (ni passé ni futur). Pour le référentiel comme pour `modele`/`produit`, ce risque est **hérité tel quel**, pas aggravé par cette phase. Proposition (reprise de l'audit Phase 5, non spécifique à cette phase) : borne de plausibilité sur `updatedAt` reçu et/ou journalisation des cas où une opération plus ancienne l'emporte sur une plus récente — **à valider comme un chantier transverse**, pas uniquement pour le référentiel.

### 10.3 Idempotence **[VALIDÉ, préservée par construction]**

Chaque upsert LWW est idempotent par construction (rejouer la même opération ne change rien si `updatedAt` est identique ou plus ancien). Le routage du §5.3 ne touche jamais au mécanisme `UNIQUE(entity_type, entity_id)` du journal hérité — aucune régression possible sur l'idempotence déjà garantie pour vente/mouvements.

### 10.4 Postes non connectés en permanence **[VALIDÉ, déjà pris en charge par le principe de l'Option A]**

Le catch-up par relecture intégrale (§7.2, point 3) ne dépend d'aucun état de session — un poste reconnecté après plusieurs jours relit l'état courant complet au cycle suivant, sans historique à rejouer (contrairement au journal par curseur). Aucune perte de modification n'est possible par construction : la projection serveur contient toujours le dernier état connu de chaque entité, quelle que soit la durée de déconnexion d'un poste donné.

---

## 11. Sécurité et robustesse réseau

Ces points, déjà identifiés par l'audit Phase 5 initial, sont repris ici car ils concernent directement l'infrastructure sur laquelle repose cette extension.

| # | Sujet | Constat **[déjà établi, non remis en question]** | Action **[PROPOSITION / À VALIDER]** |
|---|---|---|---|
| 11.1 | Rate limiting | Absent côté nginx et applicatif ; commentaire du code (`router.ts:9-21`) affirmant à tort que l'API n'est pas exposée publiquement — **obsolète**, confirmé par l'infrastructure de production existante | **[PROPOSITION]** `limit_req_zone` nginx et/ou garde applicative minimale sur l'authentification ; corriger le commentaire obsolète dans le même mouvement |
| 11.2 | Validation de `MAXI_EQUIP_API_URL` | Aucune validation de schéma (`http://` accepté sans avertissement) | **[PROPOSITION]** Avertissement explicite si `http://` est détecté en configuration packagée (hors développement local) |
| 11.3 | Vérification de l'identité du serveur | Aucun mécanisme au-delà de TLS/Certbot standard | **[À VALIDER — étude à mener, pas une implémentation]** Étudier l'intérêt d'un pinning de certificat ou d'une empreinte de clé publique côté client, pour détecter une substitution de serveur (configuration erronée ou compromission DNS) — une **étude dédiée**, pas un correctif immédiat, proportionnée au risque réel pour une architecture mono-tenant par déploiement |
| 11.4 | Backoff de retry | `boiteEnvoiRepository.enregistrerErreur()` n'avance jamais `next_attempt_at` (§2.1) | **[PROPOSITION]** Calcul d'un backoff croissant réel, colonne déjà prête dans le schéma |
| 11.5 | Risque LWW horloge client | Voir §10.2 | Renvoi à §10.2, pas dupliqué ici |
| 11.6 | Idempotence | Voir §10.3 | Renvoi à §10.3 |
| 11.7 | Postes non connectés en permanence | Voir §10.4 | Renvoi à §10.4 |

---

## 12. Migration et réconciliation des données historiques

### 12.1 Rattrapage proactif **[PROPOSITION, patron déjà éprouvé dans ce projet]**

Au premier démarrage après mise à jour, chaque poste doit pousser l'intégralité de son référentiel local déjà existant (catégories/sous-catégories/champs/unités créés avant cette phase, jamais synchronisés jusqu'ici) — même patron exact que les rattrapages déjà réalisés pour les comptes et le catalogue produits/modèles lors de phases antérieures de ce projet. Idempotent par construction (upsert LWW), ne doit s'exécuter qu'une seule fois par poste (même garde que `existeEntreePourType()` déjà utilisée pour les précédents rattrapages).

### 12.2 Réconciliation manuelle des doublons **[VALIDÉ — règle impérative]**

**Ne jamais fusionner automatiquement** deux catégories/sous-catégories/modèles/produits sur la seule base de leur nom. Si deux postes ont chacun créé indépendamment, avant cette phase, une entité de même nom mais d'id différent, le rattrapage proactif crée **deux entités distinctes côté serveur** — comportement correct et attendu, pas une anomalie à corriger automatiquement.

### 12.3 Mécanisme de diagnostic **[VALIDÉ]**

**Écran de diagnostic en lecture seule**, affiché après le rattrapage proactif. Il doit :
- Identifier les doublons **potentiels** (ex. même nom, insensible à la casse, cohérent avec la comparaison déjà pratiquée ailleurs dans ce projet — `fusionnerCaracteristiquesSuggerees` — entre catégories/sous-catégories/modèles/produits d'id différents).
- Présenter les entités concernées et leurs identifiants, pour que l'administrateur puisse comprendre les différences (origine, dates de création, contenu).
- **Ne réaliser aucune fusion, ne modifier aucune donnée** — un écran strictement en lecture, aucune mutation.

Les corrections (renommer, reclasser, supprimer l'un des doublons) restent **manuelles**, via les écrans déjà existants et déjà éprouvés — aucune nouvelle logique de mutation n'est introduite par cet écran.

**Un assistant de fusion guidée est explicitement hors périmètre** de cette phase : la réaffectation automatique des entités dépendantes (modèles/produits) qu'impliquerait un tel assistant serait une mécanique de mutation transactionnelle nouvelle et irréversible (la restauration est hors périmètre, §9.1), à construire précisément au moment où le système est le moins éprouvé — pourra être reconsidéré plus tard si l'écran de diagnostic révèle un volume de doublons qui le justifie.

### 12.4 Compatibilité des données historiques **[VALIDÉ, déjà traité en §7.4/§8.4]**

Renvoi aux sections correspondantes — aucune règle supplémentaire nécessaire ici.

---

## 13. Tests unitaires, d'intégration et multi-postes

| Niveau | Portée | Exemples concrets |
|---|---|---|
| Unitaire — repositories | `categorieRepository`/`sousCategorieRepository`/`sousCategorieChampRepository` : CRUD, `creerDepuisServeur()`, filtrage `deleted_at` ; `sousCategorieUniteRepository` : CRUD (`definir()`/`reinitialiser()`) uniquement — pas de `creerDepuisServeur()` propre (§3.7), sa réception est testée via `SousCategorieRepository.creerDepuisServeur()` | Calqués sur les tests déjà existants de `modeleRepository.test.ts`/`produitRepository.test.ts` |
| Unitaire — validateurs serveur | Rejet de payloads malformés pour les 3 nouveaux validateurs + les 2 validateurs étendus | Calqués sur `validationCatalogueSync.test.ts` existant |
| Unitaire — storage serveur | `appliquerOperationCategorie`/etc., upsert LWW, pour **les deux implémentations** (SQLite dev + Postgres prod) | Tests dupliqués pour les deux backends, comme déjà pratiqué pour `modele`/`produit` |
| Intégration — push/pull | Un push catégorie/sous-catégorie/champ traverse `push.ts` sans affecter le routage hérité (vente/mouvement) ; `GET /v1/app/referentiel/list` renvoie l'état correct après plusieurs opérations | Nouveau fichier de test, patron `catalogSync.test.ts`/`sync.test.ts` existants |
| **Intégration ciblée — point de rupture unités** | Modifier UNIQUEMENT la configuration d'unités d'une sous-catégorie déclenche bien un enfilage de synchronisation, bout en bout jusqu'au serveur | Test explicitement dédié, distinct des tests génériques de modification de sous-catégorie (cf. §6.4) |
| Intégration — suppressions | Les 7 scénarios détaillés par l'audit complémentaire (catégorie avec sous-catégories, sous-catégorie avec modèles, champ utilisé, champ obligatoire, etc.) | Reprendre chaque scénario comme cas de test explicite |
| Multi-postes (simulation) | Deux « postes » simulés (deux instances SQLite locales distinctes pointant vers le même serveur de test) : création sur l'un, catch-up vérifié sur l'autre ; conflit LWW simulé (deux modifications avec des `updatedAt` différents) | Nouveau scénario de test, possiblement sur le modèle des tests multi-postes déjà écrits pour le système de notifications (Phase E/F de ce projet) |
| Non-régression | `factureDocumentService.visuel.test.ts` et toute la suite Phase 4 restent strictement inchangés (aucun changement ne touche la génération de documents) | Re-exécution de la suite existante, pas de nouveau test |

---

## 14. Risques et dépendances

| # | Risque | Gravité | Dépendance |
|---|---|---|---|
| 14.1 | Oubli de câblage de l'enfilage pour les gestionnaires "unités" (§6.4) | Élevée | Doit être traité comme tâche explicite, pas supposée couverte par le câblage générique des sous-catégories |
| 14.2 | Suppression physique non tombstonée sur `sous_categorie_champs` — bloquant tant que non corrigé | Élevée | Prérequis technique avant toute synchronisation de suppression de champ (§3.3/§9) |
| 14.3 | Doublons historiques lors du rattrapage proactif | Élevée (opérationnel, pas technique) | Mitigé par l'écran de diagnostic validé (§12.3), à construire avant toute activation en production |
| 14.4 | Absence de rate limiting sur une API déjà exposée publiquement | Élevée (hérité, pas introduit par cette phase) | Indépendant du reste de cette phase, mais sur la même surface d'attaque |
| 14.5 | Gaspillage réseau marginal (relecture intégrale à chaque cycle de 5 min) | Faible | Accepté comme limite connue de l'Option A, cohérent avec le comportement déjà en place pour modèle/produit |
| 14.6 | Confirmation IHM pour suppression de champ obligatoire | Moyenne | Mécanisme précis d'interface non spécifié par ce document (§9.2) |

---

## 15. Découpage recommandé en sous-phases **[PROPOSITION]**

1. **Fondations serveur** — nouvelles tables de projection (§4), validateurs (§5.1), méthodes `ServerStorage` (§5.2). Aucune route exposée, aucun risque.
2. **Route de lecture catch-up** — `GET /v1/app/referentiel/list` en lecture seule (§5.4), tables encore vides en production.
3. **Push client → serveur** — `TypeOperationBoiteEnvoi` étendu, fonctions d'enfilage (§6.1-6.2), câblage des 9 gestionnaires "de base" (§6.3) **et, séparément et explicitement, des 2 gestionnaires "unités"** (§6.4) avec son test dédié. Routage serveur étendu (§5.3). Fenêtre intermédiaire sûre : rien n'est encore appliqué localement sur les autres postes.
4. **Application locale (pull)** — `creerDepuisServeur()` sur les 3 repositories (§3.7), `ReferentielSyncService` (§6.6), câblage dans le cycle périodique. La boucle se referme : deux postes convergent réellement.
5. **Complétude modèle/produit** — champs manquants (§8), câblage des colonnes déjà dormantes côté serveur (§2.1/§4.1), extension du catch-up `modele`/`produit` existant.
6. **Gestion des suppressions** — gardes bloquantes (§9.2), tombstone sur les champs (§3.3), confirmation IHM pour champ obligatoire.
7. **Rattrapage proactif** — passe unique de migration (§12.1), **précédée** de la mise à disposition de l'outil de diagnostic des doublons (§12.3) avant toute activation en production.
8. **Durcissement différé** — notification SSE immédiate (§5.5), backoff réel (§11.4), validation de `MAXI_EQUIP_API_URL` (§11.2), étude de vérification d'identité serveur (§11.3), rate limiting (§11.1) — chantiers pouvant progresser en parallèle, non bloquants pour les étapes 1-7.

---

## Annexe — Correspondance avec les documents précédents

Ce cahier des charges ne répète pas le détail des audits déjà produits ; il en consolide les conclusions validées. Pour le détail de la méthode d'investigation et les citations exhaustives de code ayant mené à chaque constat, se référer aux trois audits précédents de cette même phase (architecture existante ; comparaison d'options architecturales ; isolation/versionnement/suppressions).
