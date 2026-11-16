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
NOM_DISTANT="postgres/$(basename "${FICHIER_LOCAL}")"

# pg_dump exécuté DANS le conteneur postgres (jamais besoin d'exposer son
# port sur le VPS pour cette opération) — compressé avant de quitter le
# conteneur, jamais un dump non compressé transféré sur le réseau.
docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${FICHIER_LOCAL}"

# Correction (diagnostic 2026-11-16) : un fichier local vide ou absent ne
# doit jamais être envoyé — pg_dump a pu échouer silencieusement en tête
# de pipeline malgré `pipefail` dans de rares cas (ex. conteneur arrêté
# entre la vérification et l'exécution).
if [ ! -s "${FICHIER_LOCAL}" ]; then
  echo "ERREUR : le fichier de sauvegarde local est absent ou vide (${FICHIER_LOCAL})." >&2
  exit 1
fi
TAILLE_LOCALE="$(stat -c%s "${FICHIER_LOCAL}")"

aws --profile maxiequip-b2 --endpoint-url "${CLOUD_BACKUP_ENDPOINT}" \
  s3 cp "${FICHIER_LOCAL}" "s3://${CLOUD_BACKUP_BUCKET}/${NOM_DISTANT}"

# Correction (diagnostic 2026-11-16) : `aws s3 cp` peut retourner 0 sans
# que l'objet soit réellement persisté sur ce point de compatibilité B2
# (cause exacte : échec de connexion HTTP silencieusement avalé par le
# transfert managé — voir le rapport de diagnostic). Un code 0 seul
# n'est donc jamais une preuve suffisante : on vérifie indépendamment
# l'existence ET la taille de l'objet distant avant de nettoyer le
# fichier local ou d'annoncer un succès. En cas d'échec de cette
# vérification, le fichier local est CONSERVÉ (jamais supprimé) pour
# permettre une nouvelle tentative ou une récupération manuelle.
TAILLE_DISTANTE="$(aws --profile maxiequip-b2 --endpoint-url "${CLOUD_BACKUP_ENDPOINT}" \
  s3api head-object --bucket "${CLOUD_BACKUP_BUCKET}" --key "${NOM_DISTANT}" \
  --query 'ContentLength' --output text 2>/dev/null || echo "")"

if [ -z "${TAILLE_DISTANTE}" ] || [ "${TAILLE_DISTANTE}" != "${TAILLE_LOCALE}" ]; then
  echo "ERREUR : la sauvegarde n'a pas pu être vérifiée sur B2 (objet absent ou taille distante '${TAILLE_DISTANTE:-absente}' ≠ taille locale '${TAILLE_LOCALE}'). Fichier local conservé : ${FICHIER_LOCAL}" >&2
  exit 1
fi

rm -f "${FICHIER_LOCAL}"

echo "Sauvegarde PostgreSQL envoyée et VÉRIFIÉE sur B2 (${TAILLE_DISTANTE} octets) : ${NOM_DISTANT}"
