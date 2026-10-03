import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { B2RecuperationConfig } from "./config.js";

// EXACTEMENT le même préfixe que CloudBackupService.clePourNom() côté
// Electron (`backups/<nomBackup>/{database.sqlite,metadata.json,checksum.json}`)
// — jamais une convention divergente inventée côté serveur.
const PREFIXE_SAUVEGARDES = "backups/";
const DUREE_URL_PRESIGNEE_SECONDES = 15 * 60;

export interface UrlsSauvegarde {
  database: string;
  metadata: string;
  checksum: string;
}

function creerClientS3(config: B2RecuperationConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.endpoint}`,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.applicationKey },
  });
}

/**
 * Trouve la sauvegarde la plus récente (dossier `backups/<nomBackup>/`,
 * regroupant 3 fichiers uploadés ensemble par CloudBackupService — voir
 * son commentaire d'en-tête : "un upload réussi ne suffit pas", d'où le
 * checksum.json vérifié côté client après téléchargement, jamais ici) et
 * retourne 3 URLs de téléchargement présignées, valides 15 minutes.
 * Jamais les identifiants B2 eux-mêmes transmis au client (voir
 * config.ts : cette clé reste uniquement côté serveur).
 *
 * Retourne `null` s'il n'existe encore aucune sauvegarde (PC Shop jamais
 * configuré pour la sauvegarde cloud, ou pas encore de premier backup).
 */
export async function genererUrlsDerniereSauvegarde(config: B2RecuperationConfig): Promise<UrlsSauvegarde | null> {
  const client = creerClientS3(config);

  const liste = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: PREFIXE_SAUVEGARDES }));
  const objets = liste.Contents ?? [];
  if (objets.length === 0) return null;

  // Le nom du backup est le premier segment après le préfixe
  // ("backups/<nomBackup>/fichier" → "<nomBackup>") — regrouper par ce
  // segment pour identifier le backup le plus récent dans son ensemble,
  // jamais un fichier isolé d'un backup partiellement uploadé plus ancien.
  let nomBackupRecent: string | null = null;
  let dateRecente = 0;
  for (const objet of objets) {
    if (!objet.Key) continue;
    const suffixe = objet.Key.slice(PREFIXE_SAUVEGARDES.length);
    const nomBackup = suffixe.split("/")[0];
    if (!nomBackup) continue;
    const date = objet.LastModified?.getTime() ?? 0;
    if (date > dateRecente) {
      dateRecente = date;
      nomBackupRecent = nomBackup;
    }
  }
  if (!nomBackupRecent) return null;

  const genererUrl = (fichier: string) =>
    getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: `${PREFIXE_SAUVEGARDES}${nomBackupRecent}/${fichier}` }), {
      expiresIn: DUREE_URL_PRESIGNEE_SECONDES,
    });

  const [database, metadata, checksum] = await Promise.all([
    genererUrl("database.sqlite"),
    genererUrl("metadata.json"),
    genererUrl("checksum.json"),
  ]);

  return { database, metadata, checksum };
}
