/**
 * Abstraction du stockage cloud — Bloc 4 (remédiation pré-production).
 * Le domaine/service de sauvegarde (`cloudBackupService.ts`) ne dépend
 * JAMAIS de `@aws-sdk/client-s3` directement — uniquement de ce contrat,
 * pour ne jamais coupler l'application à un fournisseur précis (§ "ne
 * pas coupler inutilement le domaine au fournisseur"). Compatible avec
 * n'importe quel service parlant le protocole S3 (AWS S3, MinIO,
 * Backblaze B2, DigitalOcean Spaces, ou un serveur de test local) — seul
 * `S3CloudBackupProvider` (ci-après) connaît ce détail.
 */
export interface CloudBackupProvider {
  upload(cle: string, donnees: Buffer): Promise<void>;
  download(cle: string): Promise<Buffer>;
  list(prefixe: string): Promise<string[]>;
  delete(cle: string): Promise<void>;
  exists(cle: string): Promise<boolean>;
}
