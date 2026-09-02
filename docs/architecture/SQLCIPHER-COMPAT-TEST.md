# Test de compatibilité SQLCipher / Electron — Phase 0

Réalisé le 2 septembre 2026, dans l'environnement de développement (Node.js v22.22.2, Electron v31.7.7 linux x64).

## Bibliothèque retenue

`better-sqlite3-multiple-ciphers` — fork de `better-sqlite3` intégrant SQLite3 Multiple Ciphers
(implémentation compatible SQLCipher : AES-256-CBC + HMAC-SHA512, conforme à la Synthèse §2 /
Corrections §2).

## Résultat initial (échec attendu, documenté pour mémoire)

Le paquet npm fournit un binaire natif prébuilt, compilé pour l'ABI Node.js standard
(`NODE_MODULE_VERSION 127`). Electron embarque sa propre version de Node avec une ABI différente
(`NODE_MODULE_VERSION 125` pour Electron 31). Chargé tel quel dans le processus principal
d'Electron, le module refuse de se charger :

```
Error: ... was compiled against a different Node.js version using NODE_MODULE_VERSION 127.
This version of Node.js requires NODE_MODULE_VERSION 125.
```

**Ce n'est pas un problème de compatibilité SQLCipher/Electron** — c'est le problème standard et
documenté de tout module natif Node utilisé dans Electron, avec une solution standard.

## Solution appliquée

Reconstruction du module contre l'ABI d'Electron via `@electron/rebuild` :

```
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
```

Cette étape est intégrée au script `postinstall` du package `electron-app` (voir
`packages/electron-app/package.json`), de sorte qu'elle s'exécute automatiquement à chaque
`npm install`, sans action manuelle requise en développement comme en intégration continue.

## Résultat après reconstruction

| Vérification demandée                                             | Résultat                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Electron peut charger le module                                   | ✅ OK                                                                   |
| La base peut être créée                                           | ✅ OK                                                                   |
| La base peut être ouverte                                         | ✅ OK                                                                   |
| Le chiffrement fonctionne (fichier illisible en clair sur disque) | ✅ OK — le texte inséré n'apparaît pas dans les octets bruts du fichier |
| Une mauvaise clé ne permet pas de lire la base                    | ✅ OK — `SqliteError: file is not a database`                           |
| Compatible avec l'environnement de développement choisi           | ✅ OK (Node 22, Electron 31, linux x64)                                 |

## Verdict

**Aucun blocage.** SQLCipher (via `better-sqlite3-multiple-ciphers`) est utilisable avec Electron
dans ce projet, à condition de conserver l'étape de reconstruction native (`electron-rebuild`)
comme partie intégrante du processus d'installation — ce qui est désormais le cas.

## Point de vigilance pour la suite

Ce test a été mené sur linux x64 (environnement de développement). Le poste SHOP cible est
Windows — la reconstruction native devra être revérifiée sur Windows avant la mise en production
(le mécanisme est identique, mais la vérification physique sur la plateforme cible reste à faire
en Phase 2/7). Ce point est noté explicitement comme risque résiduel, pas comme un blocage.
