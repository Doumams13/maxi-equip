# Étude — Vérification renforcée de l'identité du serveur (certificate/public key pinning)

Phase 5 (référentiel commun), sous-phase 5.8, chantier D. **Document d'étude uniquement — aucun mécanisme de pinning n'est implémenté dans le code à l'issue de ce document.**

Convention de lecture :
- **[FAIT]** — vérifié directement dans le code ou l'infrastructure de ce dépôt.
- **[HYPOTHÈSE]** — déduction raisonnable, non vérifiable depuis le dépôt seul (ex. comportement réel de Let's Encrypt, habitudes de l'opérateur).
- **[RECOMMANDATION]** — jugement, pas un fait.

---

## 1. Architecture réseau actuelle [FAIT]

Vérifiée depuis `deploy/README.md`, `deploy/nginx/maxi-equip.conf` et `deploy/docker-compose.yml`.

```
Poste Electron (PC Shop / jusqu'à 5 PC annexes)
        │  HTTPS (TLS 1.2/1.3, certificat Let's Encrypt)
        ▼
  api.maxi-equip.com  ──▶  Nginx (natif sur le VPS, hors Docker)
                                │  reverse proxy, 127.0.0.1:8787
                                ▼
                         API Node.js (Docker, port NON publié)
                                │
                                ▼
                         PostgreSQL (Docker, volume nommé, port NON publié)
```

- Un seul VPS, une seule IP, un seul certificat par domaine (`api.maxi-equip.com`, `maxi-equip.com`, `www.maxi-equip.com`).
- `api`/`site`/`postgres` tournent dans Docker, **aucun port publié** directement — uniquement joignables via Nginx en `127.0.0.1`.
- Nginx est installé **nativement** sur le VPS (hors Docker), explicitement pour que Certbot (`certbot --nginx`) puisse réécrire sa configuration lui-même et gérer le renouvellement.
- Le flux SSE de synchronisation (`/v1/app/sync/stream`) passe par la même terminaison TLS Nginx, avec `proxy_buffering off` et un timeout étendu (1h).
- Le mécanisme de mise à jour automatique (`electron-updater`) télécharge l'installeur et `latest.yml` depuis `https://api.maxi-equip.com/updates/`, servi en statique par Nginx — **même terminaison TLS que l'API**, aucun canal séparé.
- Échelle réelle : au maximum 6 postes clients Electron par installation (1 PC Shop + jusqu'à 5 PC annexes, limite imposée côté serveur — voir `serverStorage.ts`/`posteStore.ts`).

## 2. Fonctionnement actuel de TLS [FAIT]

- Certificats émis et renouvelés par **Let's Encrypt via Certbot**, plugin nginx (`certbot --nginx`), confirmé par la procédure documentée dans `deploy/nginx/maxi-equip.conf` et `deploy/README.md` (étape 5-6).
- Certbot réécrit lui-même le fichier nginx pour ajouter les blocs `listen 443 ssl` et la redirection HTTP→HTTPS — ce dépôt ne contient volontairement que les blocs HTTP de départ.
- **[HYPOTHÈSE]** Certbot est configuré avec son renouvellement automatique standard (`certbot renew`, typiquement via un timer systemd ou une tâche cron installée par le paquet Debian/Ubuntu `certbot`), comme c'est le comportement par défaut de cet outil — rien dans le dépôt ne confirme ou n'infirme un cron explicite, puisque Certbot l'installe lui-même en dehors de ce dépôt.
- Les certificats Let's Encrypt ont une durée de vie de 90 jours ; un renouvellement automatique intervient normalement bien avant l'expiration (typiquement autour du 60ᵉ jour).
- Côté client Electron, aucun code de ce dépôt ne fait de vérification TLS personnalisée : le client s'appuie sur `fetch`/Node.js et sa validation de chaîne de certificats standard contre l'autorité de certification (CA) du système d'exploitation — **[FAIT]**, confirmé par une recherche exhaustive dans `packages/electron-app/src` (aucune référence à `tls.checkServerIdentity`, `rejectUnauthorized`, `ca:`, ni à un quelconque module de pinning).
- Le chantier C de cette même sous-phase (5.8) ajoute un avertissement si l'URL configurée n'est pas en HTTPS en dehors du développement local — un contrôle de FORME (protocole), pas d'identité cryptographique du serveur. Il ne change rien à ce qui suit.

## 3. Risques que le pinning pourrait réduire [HYPOTHÈSE/théorique]

Le pinning (verrouiller le client sur un certificat, une clé publique, ou une empreinte précise, au-delà de la simple validation de chaîne CA) protège théoriquement contre :

- Une **autorité de certification compromise ou contrainte** émettant un certificat frauduleux pour `api.maxi-equip.com` (scénario rare mais documenté historiquement — ex. incidents DigiNotar, divers CA chinoises/intermédiaires compromis).
- Une **interception active (MITM)** réalisée via un certificat frauduleux accepté par le magasin de CA du poste client (ex. logiciel de filtrage réseau d'entreprise, proxy SSL d'un antivirus mal configuré, ou certificat racine injecté par un acteur malveillant ayant un accès administrateur local).
- Dans une moindre mesure, un **DNS détourné** combiné à un certificat obtenu frauduleusement pour le même domaine.

Pour MAXI EQUIP, le trafic protégé concerne : le jeton JWT applicatif (porteur, voir `jwt.ts`), les données métier (catalogue, ventes, stock), et — point notable — le flux de mise à jour automatique de l'application elle-même.

## 4. Limites et risques du pinning [FAIT pour le contexte projet + HYPOTHÈSE pour les conséquences générales]

- Le pinning ne protège **pas** contre un serveur légitime compromis (la clé privée du VPS lui-même volée) — dans ce cas, le certificat/la clé épinglée resteraient ceux de l'attaquant tant qu'ils n'ont pas changé.
- Il transforme une panne de certificat (expiration non renouvelée, erreur d'émission) en **panne totale et immédiate de la synchronisation sur tous les postes**, là où la validation CA standard échouerait de la même façon de toute manière dans ce cas précis — le pinning n'aggrave donc pas CE cas, mais en ajoute un nouveau : un renouvellement **réussi** mais avec une **clé différente** de celle épinglée (voir §5) bloquerait des postes qui, sans pinning, continueraient de fonctionner normalement.
- Il nécessite un **mécanisme de mise à jour de l'épinglage** robuste et testé, sous peine de verrouiller définitivement une flotte de clients sur une ancienne clé lors d'une rotation légitime — c'est le risque le plus documenté historiquement contre ce mécanisme (cas réel : HPKP, abandonné par les navigateurs justement pour ce risque de "verrouillage" irréversible, voir §9).
- **[FAIT, spécifique à MAXI EQUIP]** Le canal de mise à jour automatique (`electron-updater`) et le canal de synchronisation partagent la **même terminaison TLS** (`api.maxi-equip.com`). Un pinning mal implémenté ou mal mis à jour pourrait donc, dans le pire cas, bloquer simultanément la synchronisation **et** le mécanisme même qui permettrait de livrer un correctif — un poste ainsi bloqué ne pourrait plus se corriger lui-même à distance.

## 5. Conséquences d'un renouvellement de certificat [FAIT + HYPOTHÈSE]

- **[FAIT]** Avec Let's Encrypt/Certbot, chaque renouvellement (tous les ~60 jours en pratique) régénère généralement une **nouvelle paire de clés** par défaut (comportement standard de Certbot, sauf configuration explicite contraire `--reuse-key`, qui n'est pas utilisée ici — aucune trace d'une telle option dans ce dépôt).
- Conséquence directe : un **certificate pinning classique** (épinglage du certificat complet ou de son empreinte SHA-256) **casserait la connexion à chaque renouvellement**, c'est-à-dire environ tous les deux mois, sur tous les postes, sans action du côté serveur pour les prévenir.
- Un **public key pinning** avec l'option `--reuse-key` de Certbot (clé publique stable à travers les renouvellements) atténuerait ce problème spécifique, mais ajoute une dépendance opérationnelle supplémentaire (il faudrait l'activer et ne jamais l'oublier lors d'une réinstallation du serveur) et reste vulnérable à toute rotation volontaire de la clé (migration de serveur, rotation de sécurité planifiée).

## 6. Conséquences d'un changement de serveur ou de clé [HYPOTHÈSE, raisonnement direct]

- Migration vers un nouveau VPS, changement d'hébergeur, ou rotation volontaire de clé pour des raisons de sécurité : dans tous ces cas, la clé/le certificat change légitimement.
- Sans mécanisme de mise à jour de l'épinglage **déployé sur les postes AVANT** le changement, tous les postes Electron perdraient la capacité de se synchroniser — et, comme noté en §4, potentiellement aussi la capacité de recevoir la mise à jour qui corrigerait ce blocage.
- Le parc de MAXI EQUIP (≤ 6 postes par installation, souvent chez un client sans compétence technique locale) rend une procédure de récupération manuelle (ex. réinstallation complète de l'application) **coûteuse en support**, bien plus que pour un opérateur gérant un parc de postes managés centralement.

## 7. Risques de blocage des postes clients [HYPOTHÈSE, direct de ce qui précède]

C'est le risque dominant pour ce projet précis : un mécanisme de pinning mal conçu ou mal opéré peut transformer un évènement anodin et déjà géré aujourd'hui sans incident (renouvellement Let's Encrypt) en incident de service pour l'ensemble des postes d'une installation, avec un chemin de récupération qui passe potentiellement par une intervention manuelle sur chaque poste.

## 8. Possibilités de rotation des clés [HYPOTHÈSE/connaissance générale du domaine]

Les approches qui atténuent (sans éliminer) le risque de blocage :
- **Épingler plusieurs clés simultanément** (actuelle + prochaine, à l'avance) — nécessite de connaître la future clé avant de l'activer côté serveur, et de déployer cette liste élargie sur tous les postes suffisamment longtemps à l'avance.
- **Fenêtre de battement** : accepter l'ancienne ET la nouvelle clé pendant une période de transition.
- **Pinning "souple"** (avertir sans bloquer en cas de non-correspondance, plutôt que refuser la connexion) — réduit drastiquement le risque de blocage, mais réduit d'autant la protection réelle apportée (un attaquant capable de MITM peut aussi supprimer l'avertissement côté client si le mécanisme n'est pas conçu avec soin).
Ces trois approches demandent une **infrastructure de distribution de la configuration d'épinglage** qui n'existe pas aujourd'hui dans MAXI EQUIP, et qui devrait elle-même être sécurisée (sinon elle devient la nouvelle cible).

## 9. Coûts de maintenance [HYPOTHÈSE + connaissance générale du domaine]

- Mise à jour de la configuration d'épinglage à chaque rotation de clé planifiée — une tâche manuelle supplémentaire, à ne jamais oublier, qui s'ajoute à la procédure déjà documentée dans `deploy/README.md`.
- Tests de non-régression supplémentaires à chaque déploiement touchant TLS.
- Risque de régression silencieuse : un oubli de mise à jour de l'épinglage ne se manifeste qu'au moment du renouvellement suivant, potentiellement des semaines plus tard — loin du changement qui l'a causé, donc difficile à diagnostiquer pour un opérateur non spécialisé.
- Référence historique notable : **HTTP Public Key Pinning (HPKP)**, un mécanisme standardisé par l'IETF pour le web, a été **retiré de tous les navigateurs majeurs** (Chrome dès 2018, puis Firefox) précisément à cause de ce risque de verrouillage permanent de sites entiers suite à une erreur de configuration — un signal fort, à l'échelle de l'industrie, que le compromis coût/bénéfice de ce mécanisme est défavorable dans la majorité des contextes, y compris bien mieux outillés que celui de MAXI EQUIP.

## 10. Avantages et inconvénients comparés des approches

| Approche | Avantage principal | Inconvénient principal | Pertinence pour MAXI EQUIP |
|---|---|---|---|
| TLS standard (validation CA du système) — **statu quo actuel** | Aucune maintenance supplémentaire ; renouvellement Certbot totalement transparent | Vulnérable en théorie à une CA compromise (risque résiduel très faible en pratique) | Déjà en place, fonctionne, aucun incident connu |
| Certificate pinning (certificat exact) | Protection maximale contre un certificat frauduleux | Casse à **chaque** renouvellement Let's Encrypt (~60 jours) sans `--reuse-key` | Rapport coût/bénéfice très défavorable ici |
| Public key pinning (avec `--reuse-key`) | Survit aux renouvellements si la clé est stable | Dépendance opérationnelle fragile (un oubli de `--reuse-key` lors d'une réinstallation casse tout) ; toujours vulnérable à une rotation volontaire | Moins mauvais que le certificat exact, reste risqué pour un parc non géré centralement |
| Empreinte de CA intermédiaire (pinning "CA pinning") | Survit aux renouvellements ET aux rotations de clé serveur (tant que la même CA est utilisée) | Protection plus faible (toute compromission de cette CA reste exploitable) ; peu de bibliothèques Node/Electron l'exposent nativement de façon simple | Compromis rarement utilisé en pratique pour ce gain limité |
| Pinning "souple" (avertissement, jamais un refus) | Risque de blocage quasi nul | Protection réelle très limitée si mal conçu | Probablement le seul profil de pinning qui ne dégraderait pas la fiabilité, mais apporte peu par rapport au coût d'implémentation |

---

## Recommandation [RECOMMANDATION]

**Ne pas implémenter de certificate pinning ni de public key pinning pour MAXI EQUIP dans l'état actuel de l'architecture.**

Justification, propre au contexte réel de ce projet (pas une réponse générique) :

1. Le renouvellement automatique Let's Encrypt/Certbot, déjà en place et déjà vérifié en conditions réelles (`deploy/README.md` : tests réels de déploiement documentés), est précisément le type de mécanisme que le pinning classique rendrait problématique.
2. Le canal de mise à jour automatique de l'application partage la même terminaison TLS que la synchronisation — un pinning défaillant mettrait en péril le mécanisme même qui permettrait de corriger ce problème à distance.
3. Le parc de postes est petit (≤ 6 par installation) mais **non géré centralement** par une équipe IT — le coût de récupération d'un poste bloqué (souvent chez un commerçant sans compétence technique) est disproportionné par rapport au risque réellement couvert (compromission de CA, un évènement rarissime).
4. L'industrie elle-même (retrait de HPKP par les navigateurs) a tranché ce même arbitrage dans le même sens pour un public pourtant bien plus large et mieux outillé.
5. Le risque principal que le pinning viserait à couvrir (interception active par certificat frauduleux) a une probabilité très faible comparée aux risques déjà traités ou documentés ailleurs dans ce projet (protection des jetons, authentification, autorisation par poste).

**Ce qui reste réellement utile, et qui ne nécessite aucun pinning :**
- Continuer à s'assurer que `MAXI_EQUIP_API_URL` utilise bien HTTPS en production (chantier C de cette même sous-phase).
- Garder la procédure de renouvellement Certbot automatique surveillée (ex. une alerte si `certbot renew` échoue — hors périmètre de ce document, point opérationnel pour le VPS).
- Si le besoin de sécurité du projet devait un jour évoluer significativement (ex. exigence contractuelle, changement de profil de menace), cette étude pourra être reprise en envisageant un pinning "souple" avec fenêtre de double-clé — jamais un pinning strict sur certificat exact.

**Aucun changement n'a été effectué sur le code réseau, les certificats, ou la configuration TLS à l'occasion de cette étude.**
