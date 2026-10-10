import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Route } from "../../../core/types.js";
import { NotFoundError, ValidationError } from "../../../core/errors.js";

/**
 * GET /v1/public/images?file=<nom> — sert les fichiers écrits par
 * POST /v1/app/images/sync (voir ce fichier pour le choix de stockage).
 * Public et sans authentification par nature — ce sont des photos de
 * carreaux destinées au site vitrine.
 *
 * Nom de fichier validé par une liste blanche stricte (jamais un chemin
 * arbitraire) — empêche toute traversée de répertoire (`../..`) même si
 * le paramètre `file` provient d'une requête non fiable.
 */

const NOM_FICHIER_VALIDE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const CONTENT_TYPE_PAR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function storageDir(): string {
  return process.env["IMAGES_STORAGE_DIR"] ?? "./public-images";
}

export const publicImageRoute: Route = {
  method: "GET",
  path: "/public/images",
  trustLevel: "public",
  handler: (req) => {
    const file = req.query["file"];
    if (!file || !NOM_FICHIER_VALIDE.test(file)) {
      throw new ValidationError("Paramètre 'file' invalide.");
    }
    const chemin = join(storageDir(), file);
    if (!existsSync(chemin)) {
      throw new NotFoundError("Image introuvable.");
    }
    const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
    const data = readFileSync(chemin);
    // Cache long + ETag — correction "photos lentes à charger" (2026-10-10) :
    // le nom de fichier inclut un suffixe aléatoire généré à chaque sync
    // (voir routes/v1/app/images/sync.ts), donc pour UN nom de fichier donné
    // le contenu ne change jamais — un cache "immutable" d'un an est sûr,
    // jamais un risque de servir une image périmée sous le même nom.
    const etag = `"${createHash("sha1").update(data).digest("hex")}"`;
    const headers = { "Cache-Control": "public, max-age=31536000, immutable", ETag: etag };
    if (req.headers["if-none-match"] === etag) {
      return { status: 304, body: undefined, headers };
    }
    return {
      status: 200,
      body: undefined,
      raw: { contentType: CONTENT_TYPE_PAR_EXTENSION[extension] ?? "application/octet-stream", data },
      headers,
    };
  },
};
