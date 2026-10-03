# Déploiement production MAXI EQUIP

Référence : `INTERNET → maxi-equip.com → NGINX → { Site Next.js, API } → PostgreSQL → B2`.
Suit l'ordre de travail validé. Étapes 1-2 (achat VPS/domaine, compte Backblaze B2) sont manuelles, hors de ce document.

## 3. Configurer le VPS

```bash
# Utilisateur admin non-root + SSH par clé uniquement, désactiver le mot de passe root
adduser maxiequip && usermod -aG sudo maxiequip
# ~/.ssh/authorized_keys renseigné avant de désactiver le mot de passe dans sshd_config :
#   PasswordAuthentication no
#   PermitRootLogin no

# Firewall minimal
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable

# Docker + Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker maxiequip

# Nginx + Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Pointer les enregistrements DNS `maxi-equip.com`, `www.maxi-equip.com` et `api.maxi-equip.com` vers l'IP du VPS AVANT l'étape Certbot ci-dessous (Let's Encrypt vérifie le domaine par HTTP).

## 4. PostgreSQL

Géré par `docker-compose.yml` (service `postgres`, volume nommé, **aucun port publié** — jamais accessible depuis l'extérieur du réseau Docker). Rien à faire séparément : `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` viennent de `deploy/.env.production`.

## 5-6. Déployer l'API et le site

```bash
git clone <votre-dépôt> /opt/maxi-equip && cd /opt/maxi-equip
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production   # renseigner les vraies valeurs (voir commentaires du fichier)

docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d --build
docker compose -f deploy/docker-compose.yml ps   # vérifier que les 3 services sont "healthy"/"running"
```

Puis activer Nginx (voir `deploy/nginx/maxi-equip.conf` pour la procédure complète, résumée ici) :

```bash
sudo cp deploy/nginx/maxi-equip.conf /etc/nginx/sites-available/maxi-equip.conf
sudo ln -s /etc/nginx/sites-available/maxi-equip.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d maxi-equip.com -d www.maxi-equip.com -d api.maxi-equip.com
```

**Vérification réelle avant de continuer** (ne jamais supposer que ça fonctionne) :
```bash
curl -I https://api.maxi-equip.com/v1/public/health   # doit répondre 200
curl -I https://maxi-equip.com                         # doit répondre 200
```

## 7. Sauvegardes B2

- **PostgreSQL (serveur)** : aucun mécanisme n'existait déjà dans le code pour ça — script fourni : `deploy/backup-postgres-to-b2.sh` (voir son en-tête pour l'installation/cron). Clé B2 dédiée, préfixe `postgres/`.
- **SQLite (PC Shop)** : mécanisme déjà existant côté application (`CLOUD_BACKUP_*`, voir `packages/electron-app/.env.example`) — clé B2 dédiée en écriture, préfixe `backups/` (même bucket, préfixe différent — jamais mélangé avec `postgres/`). Configuré à l'étape 8.
- **Récupération d'installation** (voir section 8) : une TROISIÈME clé B2, en lecture sur le même préfixe `backups/`, réservée au serveur (`RECUPERATION_B2_*` dans `deploy/.env.production`) — jamais donnée au PC Shop. Génère des liens de téléchargement temporaires (15 min) vers la dernière sauvegarde, sans jamais exposer les identifiants B2 eux-mêmes au client.

## 8. PC Shop

### Sync classique (comme avant)

Émettre un jeton dédié, définir `MAXI_EQUIP_API_URL=https://api.maxi-equip.com` et `MAXI_EQUIP_SYNC_JWT=<jeton>` comme variables d'environnement Windows sur le PC Shop, puis relancer l'application :
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production exec api npx tsx src/scripts/emettre-jwt-installation.ts shop-1 365
```

**Test réel à faire à ce moment précis** (jamais supposé) : coupure réseau volontaire → opération locale (vente/produit) → reconnexion → vérifier dans les journaux de l'API (ou via `/v1/public/catalog/models`, `/v1/public/settings`) que la donnée est bien arrivée côté serveur.

### Récupération après vol/panne du PC Shop

Permet au propriétaire de réinstaller lui-même sans accès SSH au VPS (voir l'échange dédié) :
1. Le mot de passe du compte Administrateur local sert AUSSI de mot de passe de récupération — poussé automatiquement au serveur à sa création/changement (rien à faire de spécial).
2. PC volé/remplacé : installer l'app (non signée — Smart App Control désactivé sur le PC, voir plus bas) sur le nouveau poste → écran "Restaurer une installation existante" → saisir le mot de passe Administrateur → tout se restaure automatiquement (ventes, stock, catalogue, comptes) depuis la dernière sauvegarde cloud.
3. Nécessite que la sauvegarde cloud SQLite (`CLOUD_BACKUP_*` sur le PC Shop, voir section 7) ait déjà produit au moins une sauvegarde — sinon la récupération répond "mot de passe reconnu, mais aucune sauvegarde disponible" et bascule sur une configuration neuve.

Vérifié réellement en conditions de production (2026-09-29) : upload d'un backup de test vers B2, `definir-recuperation` + `verifier-recuperation` sur le serveur déployé, URLs présignées téléchargées avec succès, contenu confirmé identique octet pour octet — puis données de test nettoyées.

## 9. Mises à jour automatiques du PC Shop (electron-updater)

Depuis la version 0.2.0, l'application se met à jour TOUTE SEULE — plus besoin de renvoyer un installeur à chaque correction. Mécanisme : `electron-updater` (intégré à l'app) interroge `https://api.maxi-equip.com/updates/`, servi en statique par **Nginx directement** (jamais par l'API Node — voir le bloc `location /updates/` dans `/etc/nginx/sites-available/maxi-equip.conf` sur le VPS, pointant vers `/var/www/maxiequip-updates/`).

**À chaque nouvelle version, après avoir buildé normalement (`npm run dist:win`) :**
1. Incrémenter la version dans `packages/electron-app/package.json` (`electron-updater` compare les numéros de version — sans incrément, aucune mise à jour n'est détectée).
2. Récupérer les 3 fichiers générés dans `packages/electron-app/release/` :
   - `MAXI EQUIP Setup X.Y.Z.exe`
   - `MAXI EQUIP Setup X.Y.Z.exe.blockmap`
   - `latest.yml`
3. Les envoyer sur le VPS :
   ```bash
   scp "release/MAXI EQUIP Setup X.Y.Z.exe" "release/MAXI EQUIP Setup X.Y.Z.exe.blockmap" release/latest.yml \
     maxiequip@<ip-vps>:/var/www/maxiequip-updates/
   ```
4. Supprimer l'ancien `.exe`/`.blockmap` de `/var/www/maxiequip-updates/` sur le VPS (`latest.yml` est systématiquement écrasé, mais les anciens binaires ne le sont pas automatiquement — inutile de les garder).

L'app vérifie au démarrage, télécharge automatiquement en arrière-plan si une version plus récente existe, puis propose "Redémarrer et mettre à jour" dans l'en-tête (jamais un redémarrage forcé pendant l'usage — voir `ipc/autoUpdate.ts`). Installeur non signé : vérifié via le SHA-512 de `latest.yml`, pas besoin d'Authenticode pour une mise à jour appliquée depuis une app déjà installée.

Vérifié réellement (2026-10-02) : `latest.yml` et l'installeur téléchargés depuis `https://api.maxi-equip.com/updates/`, SHA-256 identique entre le fichier local et le fichier téléchargé.

## Mise à jour ultérieure (redéploiement)

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d --build
```

Le volume `maxiequip_postgres_data` et `maxiequip_images_data` survivent à un `--build` — jamais perdus lors d'une mise à jour normale. Seul un `docker compose down -v` explicite les supprimerait.

## Rollback vers une version précédente

```bash
git checkout <commit-ou-tag-précédent>
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d --build
```

PostgreSQL n'est pas affecté par un rollback de code — seul le code
applicatif change ; en cas de migration de schéma incompatible avec une
version antérieure, restaurer aussi une sauvegarde PostgreSQL
correspondante (voir section 7).
