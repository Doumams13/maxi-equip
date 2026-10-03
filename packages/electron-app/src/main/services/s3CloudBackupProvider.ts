import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { CloudBackupProvider } from "./cloudBackupProvider.js";

export interface S3CloudBackupConfig {
  bucket: string;
  region: string;
  /** Renseigné pour un fournisseur S3-compatible auto-hébergé/alternatif (MinIO, Backblaze, serveur de test) — absent pour AWS S3 réel. */
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * BUG RÉEL CORRIGÉ (2026-09-29, premier PC Shop réel) : le SDK AWS exige
 * une URL complète (schéma inclus) pour `endpoint` — un nom d'hôte nu
 * (ex. "s3.eu-central-003.backblazeb2.com", tel que documenté/saisi côté
 * CLOUD_BACKUP_ENDPOINT) fait échouer silencieusement CHAQUE upload avec
 * "Invalid URL", jamais remonté à l'utilisateur (voir main/index.ts,
 * envoyerBackupVersCloudSiConfigure — volontairement best-effort/silencieux).
 * Reproduit et vérifié réellement contre B2 avant ce correctif. Normalise
 * ici, au point d'entrée unique de ce module, plutôt que d'exiger que
 * chaque opérateur pense à inclure "https://" dans la variable d'environnement.
 */
function normaliserEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  return /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
}

const TENTATIVES_MAX = 3;
const DELAI_BASE_MS = 500;

/** Retry avec backoff exponentiel simple — jamais un mécanisme maison plus complexe qu'un compteur de tentatives, gère les coupures réseau transitoires (§ Bloc 4 : "gérer échec réseau ; gérer retry"). */
async function avecRetry<T>(operation: () => Promise<T>): Promise<T> {
  let derniereErreur: unknown;
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
    try {
      return await operation();
    } catch (err) {
      derniereErreur = err;
      if (tentative < TENTATIVES_MAX) {
        await new Promise((resolve) => setTimeout(resolve, DELAI_BASE_MS * tentative));
      }
    }
  }
  throw derniereErreur;
}

/**
 * Implémentation S3 (et compatible S3) du contrat `CloudBackupProvider`.
 * Les identifiants proviennent UNIQUEMENT des variables d'environnement
 * (jamais codés en dur, jamais commités — voir .env.example) — construits
 * et transmis par l'appelant (main/index.ts), jamais lus directement ici
 * depuis `process.env` (garde ce module testable avec n'importe quelle config).
 */
export class S3CloudBackupProvider implements CloudBackupProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3CloudBackupConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: normaliserEndpoint(config.endpoint),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(cle: string, donnees: Buffer): Promise<void> {
    await avecRetry(() => this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: cle, Body: donnees })));
  }

  async download(cle: string): Promise<Buffer> {
    return avecRetry(async () => {
      const reponse = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: cle }));
      const corps = await reponse.Body?.transformToByteArray();
      if (!corps) throw new Error(`Objet cloud vide ou introuvable : ${cle}`);
      return Buffer.from(corps);
    });
  }

  async list(prefixe: string): Promise<string[]> {
    return avecRetry(async () => {
      const reponse = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefixe }));
      return (reponse.Contents ?? []).map((o) => o.Key!).filter(Boolean);
    });
  }

  async delete(cle: string): Promise<void> {
    await avecRetry(() => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: cle })));
  }

  async exists(cle: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: cle }));
      return true;
    } catch {
      return false;
    }
  }
}
