import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests ciblés de la mise en attente de synchronisation des images
 * (correction "Intégration Site Phase 5, Partie 2") — `electron` est
 * mocké UNIQUEMENT pour `app.getPath` (répertoire de stockage), jamais
 * pour `dialog`/`BrowserWindow` (non utilisés par les méthodes testées
 * ici : `commitStaged`, `setPrincipale`, `remove`).
 */

let tempUserData: string;

vi.mock("electron", () => ({
  app: { getPath: () => tempUserData },
  dialog: {},
}));

// Import dynamique APRÈS le mock (obligatoire — vi.mock est hissé, mais
// tempUserData doit être défini avant que le module ne soit chargé pour
// de vrai, ce qui n'arrive qu'au premier appel à `new ImageService(...)`).
const { ImageService } = await import("./imageService.js");
type ImageProduitRepositoryLike = ConstructorParameters<typeof ImageService>[0];
type BrowserWindowLike = ConstructorParameters<typeof ImageService>[1];

const FENETRE_FACTICE = { isMinimized: () => false, restore: () => {}, focus: () => {}, webContents: { focus: () => {} } } as unknown as BrowserWindowLike;

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listByModele: vi.fn(() => []),
    getPrincipale: vi.fn(() => null),
    getPrincipalesForModeles: vi.fn(() => new Map()),
    create: vi.fn(() => "image-1"),
    setPrincipale: vi.fn(),
    findById: vi.fn(() => null),
    remove: vi.fn(),
    creerDepuisServeur: vi.fn(() => true),
    ...overrides,
  } as unknown as ImageProduitRepositoryLike;
}

function makeBoiteEnvoi() {
  return { creer: vi.fn<[string, string, unknown], string>(() => "envoi-1") };
}

describe("ImageService — synchronisation catalogue", () => {
  beforeEach(() => {
    tempUserData = mkdtempSync(join(tmpdir(), "maxi-equip-image-test-"));
  });
  afterEach(() => {
    rmSync(tempUserData, { recursive: true, force: true });
  });

  it("commitStaged : met en attente une opération 'image_produit' create avec les octets en base64", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    const repo = makeRepo({
      create: vi.fn(() => "image-1"),
      findById: vi.fn(() => ({ id: "image-1", modeleId: "modele-1", kind: "produit", cheminLocal: "staged.png", urlCloud: null, ordre: 0, estPrincipale: true, syncStatus: "pending", createdAt: "x", updatedAt: "x" })),
    });
    const service = new ImageService(repo, FENETRE_FACTICE, boiteEnvoi as never);

    // Simule un fichier déjà "staged" par pickFilesToStaging (écrit directement dans le dossier de staging attendu par ImageService).
    const stagingDir = join(tempUserData, "images-produits", "_staging");
    // Le constructeur crée déjà stagingDir ; on y dépose un faux fichier PNG minimal.
    writeFileSync(join(stagingDir, "staged.png"), Buffer.from("89504e470d0a1a0a", "hex"));

    service.commitStaged("modele-1", ["staged.png"], "staged.png");

    expect(boiteEnvoi.creer).toHaveBeenCalledTimes(1);
    const [type, id, payload] = boiteEnvoi.creer.mock.calls[0]!;
    expect(type).toBe("image_produit");
    expect(id).toBe("image-1");
    expect(payload).toMatchObject({ operation: "create", imageId: "image-1", modeleId: "modele-1", estPrincipale: true, contentType: "image/png" });
    expect(typeof (payload as { contentBase64: string }).contentBase64).toBe("string");
    expect((payload as { contentBase64: string }).contentBase64.length).toBeGreaterThan(0);
  });

  it("setPrincipale : met en attente une mise à jour de métadonnées SANS contentBase64 (aucun nouvel octet)", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    const repo = makeRepo({
      findById: vi.fn(() => ({ id: "image-1", modeleId: "modele-1", kind: "produit", cheminLocal: "x.png", urlCloud: null, ordre: 1, estPrincipale: true, syncStatus: "pending", createdAt: "x", updatedAt: "x" })),
    });
    const service = new ImageService(repo, FENETRE_FACTICE, boiteEnvoi as never);

    service.setPrincipale("modele-1", "image-1");

    expect(boiteEnvoi.creer).toHaveBeenCalledWith("image_produit", "image-1", expect.objectContaining({ operation: "update", estPrincipale: true }));
    const payload = boiteEnvoi.creer.mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("contentBase64");
  });

  it("remove : met en attente une opération 'delete'", () => {
    const boiteEnvoi = makeBoiteEnvoi();
    const repo = makeRepo({
      findById: vi.fn(() => ({ id: "image-1", modeleId: "modele-1", kind: "produit", cheminLocal: "x.png", urlCloud: null, ordre: 0, estPrincipale: false, syncStatus: "pending", createdAt: "x", updatedAt: "x" })),
    });
    const service = new ImageService(repo, FENETRE_FACTICE, boiteEnvoi as never);

    service.remove("image-1");

    expect(boiteEnvoi.creer).toHaveBeenCalledWith("image_produit", "image-1", expect.objectContaining({ operation: "delete", modeleId: "modele-1" }));
  });

  it("sans BoiteEnvoiRepository injectée : ne plante jamais (rétrocompatibilité)", () => {
    const repo = makeRepo({
      findById: vi.fn(() => ({ id: "image-1", modeleId: "modele-1", kind: "produit", cheminLocal: "x.png", urlCloud: null, ordre: 0, estPrincipale: false, syncStatus: "pending", createdAt: "x", updatedAt: "x" })),
    });
    const service = new ImageService(repo, FENETRE_FACTICE);
    expect(() => service.remove("image-1")).not.toThrow();
  });
});

describe("ImageService — synchroniserImagesManquantes (correction 'photos absentes sur poste restauré/secondaire')", () => {
  beforeEach(() => {
    tempUserData = mkdtempSync(join(tmpdir(), "maxi-equip-image-pull-test-"));
  });
  afterEach(() => {
    rmSync(tempUserData, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  const URL_IMAGE_1 = "https://api.example.com/v1/public/images?file=img-1-abcd1234.jpg";

  function reponseListe(images: unknown[]) {
    return new Response(JSON.stringify({ images }), { status: 200 });
  }
  function reponseBinaire(octets: string) {
    return new Response(Buffer.from(octets), { status: 200 });
  }

  it("liste vide : aucun téléchargement, résultat à zéro", async () => {
    const fetchSimule = vi.fn(async () => reponseListe([]));
    vi.stubGlobal("fetch", fetchSimule);
    const repo = makeRepo();
    const service = new ImageService(repo, FENETRE_FACTICE);

    const resultat = await service.synchroniserImagesManquantes("https://api.example.com", "jwt-test");

    expect(resultat).toEqual({ telechargees: 0 });
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("ligne locale déjà connue mais FICHIER manquant (cas restauration) : retélécharge sous le MÊME cheminLocal, ne recrée pas la ligne", async () => {
    const fetchSimule = vi.fn(async (url: string) => {
      if (url.includes("/v1/app/images/list")) return reponseListe([{ id: "img-1", modeleId: "modele-1", ordre: 0, estPrincipale: true, url: URL_IMAGE_1 }]);
      return reponseBinaire("octets-image");
    });
    vi.stubGlobal("fetch", fetchSimule);
    const repo = makeRepo({
      findById: vi.fn(() => ({ id: "img-1", modeleId: "modele-1", kind: "produit", cheminLocal: "deja-existant.jpg", urlCloud: null, ordre: 0, estPrincipale: true, syncStatus: "confirmed", createdAt: "x", updatedAt: "x" })),
    });
    const service = new ImageService(repo, FENETRE_FACTICE);

    const resultat = await service.synchroniserImagesManquantes("https://api.example.com", "jwt-test");

    expect(resultat).toEqual({ telechargees: 1 });
    expect((repo as unknown as { creerDepuisServeur: ReturnType<typeof vi.fn> }).creerDepuisServeur).not.toHaveBeenCalled();
    expect(existsSync(join(tempUserData, "images-produits", "deja-existant.jpg"))).toBe(true);
  });

  it("fichier déjà présent localement : aucun téléchargement réseau de l'image (seul l'appel de liste a lieu)", async () => {
    const fetchSimule = vi.fn(async (url: string) => {
      if (url.includes("/v1/app/images/list")) return reponseListe([{ id: "img-1", modeleId: "modele-1", ordre: 0, estPrincipale: true, url: URL_IMAGE_1 }]);
      throw new Error("ne devrait jamais être appelé — fichier déjà présent");
    });
    const repo = makeRepo({
      findById: vi.fn(() => ({ id: "img-1", modeleId: "modele-1", kind: "produit", cheminLocal: "present.jpg", urlCloud: null, ordre: 0, estPrincipale: true, syncStatus: "confirmed", createdAt: "x", updatedAt: "x" })),
    });
    const service = new ImageService(repo, FENETRE_FACTICE);
    writeFileSync(join(tempUserData, "images-produits", "present.jpg"), "deja-la");
    vi.stubGlobal("fetch", fetchSimule);

    const resultat = await service.synchroniserImagesManquantes("https://api.example.com", "jwt-test");

    expect(resultat).toEqual({ telechargees: 0 });
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("image totalement inconnue localement (vrai deuxième poste) : télécharge et crée la ligne avec un nom déterministe <id><extension>", async () => {
    const fetchSimule = vi.fn(async (url: string) => {
      if (url.includes("/v1/app/images/list")) return reponseListe([{ id: "img-nouveau", modeleId: "modele-2", ordre: 1, estPrincipale: false, url: URL_IMAGE_1 }]);
      return reponseBinaire("octets-image");
    });
    vi.stubGlobal("fetch", fetchSimule);
    const repo = makeRepo({ findById: vi.fn(() => null) });
    const service = new ImageService(repo, FENETRE_FACTICE);

    const resultat = await service.synchroniserImagesManquantes("https://api.example.com", "jwt-test");

    expect(resultat).toEqual({ telechargees: 1 });
    expect((repo as unknown as { creerDepuisServeur: ReturnType<typeof vi.fn> }).creerDepuisServeur).toHaveBeenCalledWith(
      expect.objectContaining({ id: "img-nouveau", modeleId: "modele-2", cheminLocal: "img-nouveau.jpg", ordre: 1, estPrincipale: false })
    );
    expect(existsSync(join(tempUserData, "images-produits", "img-nouveau.jpg"))).toBe(true);
  });

  it("image sans URL (jamais téléversée côté serveur) : ignorée, aucun appel réseau supplémentaire", async () => {
    const fetchSimule = vi.fn(async () => reponseListe([{ id: "img-sans-url", modeleId: "modele-1", ordre: 0, estPrincipale: false, url: null }]));
    vi.stubGlobal("fetch", fetchSimule);
    const repo = makeRepo();
    const service = new ImageService(repo, FENETRE_FACTICE);

    const resultat = await service.synchroniserImagesManquantes("https://api.example.com", "jwt-test");

    expect(resultat).toEqual({ telechargees: 0 });
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("réponse de liste en échec (HTTP non ok) : jamais une exception, résultat à zéro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const repo = makeRepo();
    const service = new ImageService(repo, FENETRE_FACTICE);

    await expect(service.synchroniserImagesManquantes("https://api.example.com", "jwt-test")).resolves.toEqual({ telechargees: 0 });
  });
});
