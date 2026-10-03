#!/usr/bin/env bash
# Sauvegarde de la base PostgreSQL de production vers Backblaze B2.
#
# CONSTAT (audit infrastructure production) : aucun code de ce dépôt
# n'implémente la sauvegarde du PostgreSQL SERVEUR — seule la base
# SQLite LOCALE du PC Shop a un mécanisme de sauvegarde cloud existant
# (packages/electron-app/src/main/services/cloudBackupService.ts). Le
# schéma d'architecture ("PostgreSQL → Sauvegardes cloud → Backblaze B2")
# suppose ce mécanisme côté serveur — signalé ici plutôt que supposé :
# ce script comble ce manque, à exécuter via une tâche cron sur le VPS
# (jamais depuis l'application elle-même, qui n'a et ne doit jamais
# avoir aucun accès réseau à PostgreSQL — seule l'API y accède).
#
# Utilise l'outil officiel `aws` (CLI AWS) contre le point de
# compatibilité S3 de Backblaze B2 — jamais une dépendance à un outil
# propriétaire B2, pour rester cohérent avec ce que l'application
# Electron utilise déjà (@aws-sdk/client-s3, S3CloudBackupProvider).
#
# Installation (sur le VPS) :
#   sudo apt-get install -y awscli
#   aws configure set aws_access_key_id     "$CLOUD_BACKUP_ACCESS_KEY_ID"   --profile maxiequip-b2
#   aws configure set aws_secret_access_key "$CLOUD_BACKUP_SECRET_ACCESS_KEY" --profile maxiequip-b2
#   chmod +x deploy/backup-postgres-to-b2.sh
#   crontab -e
#     0 3 * * * /chemin/vers/deploy/backup-postgres-to-b2.sh >> /var/log/maxiequip-backup.log 2>&1
#
# Variables requises dans l'environnement (ex. via /etc/maxiequip-backup.env,
# chargé par cron avec ". /etc/maxiequip-backup.env" avant l'appel) :
#   POSTGRES_CONTAINER, POSTGRES_USER, POSTGRES_DB,
#   CLOUD_BACKUP_BUCKET, CLOUD_BACKUP_ENDPOINT (URL B2 S3-compatible)

set -euo pipefail

: "${POSTGRES_CONTAINER:?POSTGRES_CONTAINER doit être défini (nom/ID du conteneur postgres, ex. déterminé par 'docker compose ps -q postgres')}"
: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"
: "${CLOUD_BACKUP_BUCKET:?}"
: "${CLOUD_BACKUP_ENDPOINT:?}"

HORODATAGE="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
FICHIER_LOCAL="/tmp/maxiequip-postgres-${HORODATAGE}.sql.gz"

# pg_dump exécuté DANS le conteneur postgres (jamais besoin d'exposer son
# port sur le VPS pour cette opération) — compressé avant de quitter le
# conteneur, jamais un dump non compressé transféré sur le réseau.
docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${FICHIER_LOCAL}"

aws --profile maxiequip-b2 --endpoint-url "${CLOUD_BACKUP_ENDPOINT}" \
  s3 cp "${FICHIER_LOCAL}" "s3://${CLOUD_BACKUP_BUCKET}/postgres/$(basename "${FICHIER_LOCAL}")"

rm -f "${FICHIER_LOCAL}"

echo "Sauvegarde PostgreSQL envoyée vers B2 : postgres/$(basename "${FICHIER_LOCAL}")"
