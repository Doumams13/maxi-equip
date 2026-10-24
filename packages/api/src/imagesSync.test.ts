import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { createRouter } from "./index.js";
import type { ApiRequest } from "./core/types.js";
import { signerJwt } from "./core/jwt.js";
import { initialiserStockageServeur, fermerStockageServeur } from "./core/storeServeur.js";
import { listerFichiersStockage } from "./routes/v1/app/images/sync.js";

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return { method: "GET", path: "/v1/public/health", headers: {}, query: {}, body: undefined, ...overrides };
}

const SECRET_TEST = "secret-test-images";
const MODELE_1 = "11111111-1111-4111-8111-111111111111";
const IMAGE_1 = "77777777-7777-4777-8777-777777777777";
const STORAGE_DIR = "./.test-images-storage";

// Un pixel PNG 1x1 transparent, minimal et valide — suffisant pour tester le pipeline sans dépendre d'un vrai fichier.
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function tokenValide(): string {
  return signerJwt({ sub: "installation-test", role: "app" }, SECRET_TEST, 3600);
}

function imageReq(body: Record<string, unknown>) {
  return req({ method: "POST", path: "/v1/app/images/sync", headers: { authorization: `Bearer ${tokenValide()}` }, body });
}

describe("Images catalogue — POST /v1/app/images/sync + GET /v1/public/images", () => {
  beforeEach(() => {
    process.env["JWT_SIGNING_SECRET"] = SECRET_TEST;
    process.env["MAXI_EQUIP_ENV"] = "test";
    process.env["IMAGES_STORAGE_DIR"] = STORAGE_DIR;
    initialiserStockageServeur(":memory:");
  });
  afterEach(() => {
    delete process.env["JWT_SIGNING_SECRET"];
    delete process.env["MAXI_EQUIP_ENV"];
    delete process.env["IMAGES_STORAGE_DIR"];
    fermerStockageServeur();
    if (existsSync(STORAGE_DIR)) rmSync(STORAGE_DIR, { recursive: true, force: true });
  });

  it("création avec octets : fichier écrit sur disque, URL publique renvoyée, image lisible via /v1/public/images", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      imageReq({
        operation: "create",
        imageId: IMAGE_1,
        modeleId: MODELE_1,
        kind: "produit",
        ordre: 0,
        estPrincipale: true,
        contentBase64: PNG_1PX_BASE64,
        contentType: "image/png",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    );
    expect(res.status).toBe(200);
    const corps = res.body as { success: boolean; url: string };
    expect(corps.success).toBe(true);
    expect(corps.url).toContain("/v1/public/images?file=");

    const urlObj = new URL(corps.url);
    const fichier = urlObj.searchParams.get("file")!;
    const lecture = await router.dispatch(req({ path: "/v1/public/images", query: { file: fichier } }));
    expect(lecture.status).toBe(200);
    expect(lecture.raw?.contentType).toBe("image/png");
    expect(lecture.raw?.data.length).toBeGreaterThan(0);
  });

  it("mise à jour de métadonnées seule (sans contentBase64) : ne recrée aucun fichier", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    const avant = listerFichiersStockage();
    const res = await router.dispatch(imageReq({ operation: "update", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 2, estPrincipale: false, updatedAt: "2026-01-02T00:00:00.000Z" }));
    expect(res.status).toBe(200);
    expect(listerFichiersStockage()).toEqual(avant);
  });

  it("suppression : le fichier est retiré du disque", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    expect(listerFichiersStockage()).toHaveLength(1);

    const res = await router.dispatch(imageReq({ operation: "delete", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: false, updatedAt: "2026-01-02T00:00:00.000Z" }));
    expect(res.status).toBe(200);
    expect(listerFichiersStockage()).toHaveLength(0);
  });

  it("remplacement des octets (nouvelle upload sur la même image) : l'ancien fichier est supprimé, un seul fichier reste", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    await router.dispatch(
      imageReq({ operation: "update", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-02T00:00:00.000Z" })
    );
    expect(listerFichiersStockage()).toHaveLength(1);
  });

  it("opération périmée (updatedAt plus ancien qu'un état déjà en place) : le fichier fraîchement écrit est nettoyé, jamais orphelin", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-05T00:00:00.000Z" })
    );
    const res = await router.dispatch(
      imageReq({ operation: "update", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    expect(res.status).toBe(200);
    expect((res.body as { url?: string }).url).toBeUndefined();
    expect(listerFichiersStockage()).toHaveLength(1); // uniquement le fichier de la création initiale
  });

  it("type de contenu non accepté : refusé (400)", async () => {
    const router = createRouter();
    const res = await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "application/pdf", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    expect(res.status).toBe(400);
  });

  it("route publique : nom de fichier invalide (traversée de répertoire) refusé", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/public/images", query: { file: "../../etc/passwd" } }));
    expect(res.status).toBe(400);
  });

  it("route publique : fichier inexistant renvoie 404", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ path: "/v1/public/images", query: { file: "inexistant.jpg" } }));
    expect(res.status).toBe(404);
  });

  it("route publique image : jamais authentifiée (aucun jeton nécessaire)", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    const fichiers = listerFichiersStockage();
    const res = await router.dispatch(req({ path: "/v1/public/images", query: { file: fichiers[0]! }, headers: {} }));
    expect(res.status).toBe(200);
  });

  it("POST /v1/app/images/sync sans JWT : 401", async () => {
    const router = createRouter();
    const res = await router.dispatch({
      method: "POST",
      path: "/v1/app/images/sync",
      headers: {},
      query: {},
      body: { operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /v1/app/images/list sans JWT : 401", async () => {
    const router = createRouter();
    const res = await router.dispatch(req({ method: "GET", path: "/v1/app/images/list", headers: {} }));
    expect(res.status).toBe(401);
  });

  it("GET /v1/app/images/list : renvoie l'image, même pour un modèle jamais déclaré actif (correction 'photos absentes sur poste restauré/secondaire')", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    const res = await router.dispatch(req({ method: "GET", path: "/v1/app/images/list", headers: { authorization: `Bearer ${tokenValide()}` } }));
    expect(res.status).toBe(200);
    const corps = res.body as { images: { id: string; modeleId: string; estPrincipale: boolean; url: string | null }[] };
    expect(corps.images).toHaveLength(1);
    expect(corps.images[0]!.id).toBe(IMAGE_1);
    expect(corps.images[0]!.modeleId).toBe(MODELE_1);
    expect(corps.images[0]!.url).toContain("/v1/public/images?file=");
  });

  it("GET /v1/app/images/list : une image supprimée n'apparaît plus", async () => {
    const router = createRouter();
    await router.dispatch(
      imageReq({ operation: "create", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: true, contentBase64: PNG_1PX_BASE64, contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    await router.dispatch(imageReq({ operation: "delete", imageId: IMAGE_1, modeleId: MODELE_1, kind: "produit", ordre: 0, estPrincipale: false, updatedAt: "2026-01-02T00:00:00.000Z" }));
    const res = await router.dispatch(req({ method: "GET", path: "/v1/app/images/list", headers: { authorization: `Bearer ${tokenValide()}` } }));
    const corps = res.body as { images: unknown[] };
    expect(corps.images).toHaveLength(0);
  });
});
