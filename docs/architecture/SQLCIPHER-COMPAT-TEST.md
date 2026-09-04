# Test de compatibilité SQLCipher / Electron — Phase 0

Réalisé initialement le 2 septembre 2026, dans l'environnement de développement (Node.js v22.22.2, Electron v31.7.7 linux x64).

> **Mise à jour** : la version d'Electron verrouillée pour le projet (voir `package.json` racine,
> champ `overrides`) est désormais **28.3.3**, retenue après le test initial ci-dessous pour
> contourner un bug distinct rencontré sur poste Windows (`require('electron')` retournant un
> chemin de fichier au lieu de l'API, sans lien avec SQLCipher). Le test isolé documenté ci-dessous
> a été mené avec la version 31.7.7 ; sa ré-exécution sous 28.3.3 fait l'objet d'une section dédiée
> plus bas dans ce document.

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

## Point de vigilance pour la suite (partiellement levé)

Ce test isolé a été mené sur linux x64 (environnement de développement). Le fonctionnement de
l'application complète (pas seulement ce script isolé) a depuis été **vérifié avec succès sur un
poste Windows 11 réel**, avec Electron 28.3.3 — voir capture d'écran de la Phase 0 et le compte
rendu technique associé. Le risque « jamais testé sur la plateforme cible » est donc levé au niveau
applicatif. Reste à consolider : la ré-exécution de ce script isolé précis sous Electron 28.3.3,
documentée ci-dessous.

## Ré-exécution sous Electron 28.3.3 (version verrouillée du projet)

**Statut : ⏳ en attente d'exécution.**

Cette section sera complétée avec un résultat réel (date, environnement exact, sortie de
`npm run test:sqlcipher`) dès que le test aura été rejoué explicitement sous Electron 28.3.3,
conformément à la demande de consolidation de la Phase 0. Elle ne doit pas être renseignée par
anticipation.

