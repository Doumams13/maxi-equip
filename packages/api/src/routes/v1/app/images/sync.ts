import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Route } from "../../../../core/types.js";
import { validerOperationImage, TYPES_IMAGE_ACCEPTES } from "../../../../core/validationCatalogueSync.js";
import { upsertImageMeta, findImageFilename } from "../../../../core/catalogStore.js";
import { getPublicApiBaseUrl } from "../../../../core/config.js";

/**
 * POST /v1/app/images/sync — correction "Intégration Site Phase 5,
 * Partie 2 (pipeline catalogue) / images".
 *
 * Route SÉPARÉE de POST /v1/sync/push (jamais réutilisée pour les
 * images) : une photo réelle dépasse largement la limite générique de
 * 100 Ko appliquée aux opérations JSON de synchronisation
 * (`validationSync.ts`), qui protège les autres types d'opérations —
 * jamais assouplie globalement pour ce seul besoin.
 *
 * Décision de stockage (Phase 5, choix documenté dans le rapport de fin
 * de phase) : fichiers stockés directement sur le disque du serveur API
 * (même logique que `storeServeur.ts` : réutiliser une techno déjà
 * éprouvée dans ce projet plutôt qu'introduire un fournisseur cloud non
 * choisi) — remplaçable plus tard par un vrai CDN sans changer le
 * contrat de cette route (elle retourne déjà une URL opaque, jamais un
 * chemin de fichier).
 *
 * Un seul point d'entrée pour create/update/delete (champ `operation`,
 * même convention que les opérations catalogue) — la mise à jour peut
 * omettre `contentBase64` pour ne modifier que les métadonnées
 * (réordonner, changer l'image principale) sans retransmettre le fichier.
 */

function storageDir(): string {
  const dir = process.env["IMAGES_STORAGE_DIR"] ?? "./public-images";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export const imagesSyncRoute: Route = {
  method: "POST",
  path: "/app/images/sync",
  trustLevel: "app",
  handler: async (req) => {
    const { payload, contenu } = validerOperationImage(req.body);
    const dir = storageDir();

    if (payload.operation === "delete") {
      const ancienFichier = await findImageFilename(payload.imageId);
      await upsertImageMeta(payload);
      if (ancienFichier) {
        const chemin = join(dir, ancienFichier);
        if (existsSync(chemin)) unlinkSync(chemin);
      }
      return { status: 200, body: { success: true } };
    }

    if (!contenu) {
      // Mise à jour de métadonnées seule — aucun nouveau fichier.
      await upsertImageMeta(payload);
      return { status: 200, body: { success: true } };
    }

    const extension = TYPES_IMAGE_ACCEPTES[contenu.contentType]!;
    const ancienFichier = await findImageFilename(payload.imageId);
    const filename = `${payload.imageId}-${randomUUID().slice(0, 8)}.${extension}`;
    const octets = Buffer.from(contenu.base64, "base64");
    writeFileSync(join(dir, filename), octets);

    const url = `${getPublicApiBaseUrl()}/v1/public/images?file=${encodeURIComponent(filename)}`;
    const { applique } = await upsertImageMeta(payload, { url, filename });

    if (applique && ancienFichier && ancienFichier !== filename) {
      const cheminAncien = join(dir, ancienFichier);
      if (existsSync(cheminAncien)) unlinkSync(cheminAncien);
    }
    if (!applique) {
      // Opération périmée (une plus récente est déjà en place) — le
      // fichier qu'on vient d'écrire n'est référencé par personne,
      // jamais laissé orphelin sur le disque.
      const chemin = join(dir, filename);
      if (existsSync(chemin)) unlinkSync(chemin);
    }

    return { status: 200, body: { success: true, url: applique ? url : undefined } };
  },
};

// Utilisé uniquement par les tests pour vérifier qu'aucun fichier orphelin ne reste sur le disque.
export function listerFichiersStockage(): string[] {
  const dir = storageDir();
  return existsSync(dir) ? readdirSync(dir) : [];
}
