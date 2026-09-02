# MAXI EQUIP — Vérifier la Phase 0 sur un vrai poste Windows

Ce guide s'adresse à quelqu'un qui a le projet en main sur un PC Windows (vous, ou un
développeur). Il ne demande pas d'expertise Electron — suivez les étapes dans l'ordre.

## Pourquoi ce test est nécessaire

Le socle technique (Phase 0) a été construit et testé dans un environnement Linux de
développement. Une seule chose n'a pas pu y être vérifiée : le coffre-fort sécurisé de Windows
(DPAPI), qui protège la clé de chiffrement de la base de données locale. Ce composant n'existe
que sous Windows — il faut donc un vrai poste Windows pour le vérifier. C'est le seul point
encore ouvert de la Phase 0.

## Ce qu'il faut installer AVANT de commencer

| Logiciel | Où l'obtenir | Pourquoi |
|---|---|---|
| **Node.js version 20 ou supérieure** | [nodejs.org](https://nodejs.org) (version "LTS") | Fait tourner tout le projet |
| **Git** *(optionnel)* | [git-scm.com](https://git-scm.com) | Uniquement si vous récupérez le projet via Git plutôt qu'un fichier zip |
| **Outils de compilation Visual Studio** | Voir ci-dessous | La base de données chiffrée utilise un composant qui doit être compilé spécifiquement pour Windows |

### Installer les outils de compilation (étape technique mais unique)

La base de données locale (SQLCipher) est un composant natif : Windows a besoin d'un compilateur
pour le préparer correctement sur cette machine précise. Deux façons de l'obtenir :

**Option simple** — ouvrir une invite de commande **en tant qu'administrateur** et taper :
```
npm install --global windows-build-tools
```
*(cette commande peut prendre plusieurs minutes)*

**Option alternative** — installer [Visual Studio Build Tools](https://visualstudio.microsoft.com/fr/downloads/#build-tools-for-visual-studio),
en cochant l'option **« Développement Desktop en C++ »** pendant l'installation.

## Étape 1 — Récupérer le projet

Décompressez le fichier `maxi-equip-phase0.zip` fourni, dans un dossier simple (ex.
`C:\Projets\maxi-equip`), puis ouvrez une invite de commande dans ce dossier.

## Étape 2 — Installer les dépendances

```
npm install
```

C'est normal si cette étape prend 1 à 3 minutes. Elle affichera automatiquement une ligne
mentionnant `electron-rebuild` vers la fin — c'est l'étape qui prépare la base de données chiffrée
spécifiquement pour Windows, elle est censée se produire automatiquement.

**Si cette étape affiche une erreur mentionnant `gyp` ou `MSBUILD`** : les outils de compilation
(étape précédente) ne sont pas correctement installés — revenez à cette étape avant de continuer.

## Étape 3 — Le test qui compte le plus : SQLCipher + Windows

```
cd packages/electron-app
npm run test:sqlcipher
```

### Résultat attendu (copier-coller exact) :

```
RESULTS: {
  "require": "OK",
  "create_and_write": "OK",
  "file_is_encrypted_on_disk": "OK",
  "reopen_with_correct_key": "OK",
  "reopen_with_wrong_key_rejected": "OK (lecture refusée : ...)"
}
ALL_OK
```

**Si vous voyez exactement ça : la Phase 0 est entièrement validée, plus aucune réserve.**

Si une erreur apparaît à la place, copiez le message complet et transmettez-le-moi — je
l'analyserai et proposerai une correction avant qu'on avance.

## Étape 4 — Vérifier que l'application s'ouvre vraiment (visuel)

Toujours dans `packages/electron-app` :

```
npm run dev
```

Une fenêtre nommée **MAXI EQUIP — Socle technique (Phase 0)** doit s'ouvrir, avec deux lignes
vertes :

```
✅ Socle Phase 0 opérationnel
✅ Base locale chiffrée opérationnelle — 18 tables créées (...)
```

C'est la confirmation visuelle que tout fonctionne ensemble : fenêtre, sécurité, base de données
chiffrée, et l'affichage qui en dépend. Fermez la fenêtre pour arrêter.

## Étape 5 (optionnelle) — Les autres vérifications automatiques

Depuis le dossier racine du projet (`maxi-equip`, pas `packages/electron-app`) :

```
npm run check:all
```

Doit se terminer sans aucune ligne d'erreur rouge. C'est la même vérification que j'ai effectuée
de mon côté (types, qualité de code, isolation des modules, tests).

## En cas de problème

Transmettez-moi simplement :
1. La commande exacte que vous avez lancée.
2. Le message d'erreur complet affiché (copier-coller, pas une capture d'écran si possible).

Je n'ai besoin de rien d'autre pour diagnostiquer.
