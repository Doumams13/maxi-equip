import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackupRestoreService } from "./backupRestoreService.js";

/**
 * Durcissement "plusieurs machines en parallèle" (2026-10-22) — voir le
 * commentaire dans installationRecuperationService.ts. Seul
 * `definirConfigurationSyncLocale` est remplacé par un espion (reste de
 * `./syncConfig.js` INCHANGÉ, en particulier `getConfigurationSync()`, qui
 * dégrade déjà silencieusement vers les variables d'environnement hors
 * runtime Electron réel — même principe que syncService.test.ts, jamais un
 * `vi.mock("electron")`).
 */
const definirConfigurationSyncLocaleMock = vi.hoisted(() => vi.fn());
vi.mock("./syncConfig.js", async (importActual) => {
  const actual = await importActual<typeof import("./syncConfig.js")>();
  return { ...actual, definirConfigurationSyncLocale: definirConfigurationSyncLocaleMock };
});

import { verifierEtRestaurerInstallation, telechargerSauvegardeAvecProgression } from "./installationRecuperationService.js";

function creerFakeRestoreService(): BackupRestoreService {
  return { executerRestauration: vi.fn() } as unknown as BackupRestoreService;
}

beforeEach(() => {
  definirConfigurationSyncLocaleMock.mockClear();
  process.env["MAXI_EQUIP_API_URL"] = "http://localhost:9999";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["MAXI_EQUIP_API_URL"];
});

describe("verifierEtRestaurerInstallation — durcissement 'aucune sauvegarde disponible'", () => {
  it("mot de passe valide mais aucune sauvegarde disponible → NE configure JAMAIS la synchronisation (sinon la récupération d'une autre installation pourrait être écrasée par creerAdminInitial)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ jwt: "jwt-frais", downloadUrls: null, cleChiffreeSauvegarde: null, cleChiffreeCloudBackup: null }), { status: 200 }))
    );

    const resultat = await verifierEtRestaurerInstallation("motdepasseAdminExistant", creerFakeRestoreService());

    expect(resultat.success).toBe(false);
    expect(resultat.etape).toBe("aucune_sauvegarde_disponible");
    expect(definirConfigurationSyncLocaleMock).not.toHaveBeenCalled();
  });

  it("mot de passe incorrect (401) → ne configure pas non plus la synchronisation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

    const resultat = await verifierEtRestaurerInstallation("mauvais-mot-de-passe", creerFakeRestoreService());

    expect(resultat).toEqual({ success: false, etape: "mot_de_passe_incorrect", message: "Mot de passe incorrect." });
    expect(definirConfigurationSyncLocaleMock).not.toHaveBeenCalled();
  });

  it("aucune récupération configurée (404) → ne configure pas la synchronisation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const resultat = await verifierEtRestaurerInstallation("peu-importe", creerFakeRestoreService());

    expect(resultat.etape).toBe("aucune_recuperation_configuree");
    expect(definirConfigurationSyncLocaleMock).not.toHaveBeenCalled();
  });

  it("trop de tentatives (429) → ne configure pas la synchronisation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));

    const resultat = await verifierEtRestaurerInstallation("peu-importe", creerFakeRestoreService());

    expect(resultat.etape).toBe("trop_de_tentatives");
    expect(definirConfigurationSyncLocaleMock).not.toHaveBeenCalled();
  });

  // Le chemin "sauvegarde disponible → restauration → configuration de la
  // synchronisation" (succès complet) exige `app.getPath()` (Electron réel,
  // voir ipc/installationRecuperation.ts et scripts/test-auth-bootstrap.cjs)
  // — hors scope de ce durcissement, qui ne touche QUE la branche "aucune
  // sauvegarde disponible" ci-dessus, jamais ce chemin de succès inchangé.
});

/**
 * Progression (2026-10-22, retour utilisateur visuel : "on ne voit rien
 * pendant le téléchargement") — `onProgress` est un callback OPTIONNEL :
 * les 5 tests ci-dessus l'appellent déjà SANS ce paramètre et continuent
 * de passer, preuve qu'aucun site d'appel existant n'est cassé.
 */
describe("verifierEtRestaurerInstallation — callback onProgress", () => {
  it("appelle onProgress('verification') avant le moindre appel réseau, puis s'arrête là si le mot de passe est incorrect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const etapes: string[] = [];

    await verifierEtRestaurerInstallation("mauvais-mot-de-passe", creerFakeRestoreService(), (etape) => etapes.push(etape));

    expect(etapes).toEqual(["verification"]);
  });

  it("s'arrête à onProgress('verification') quand aucune sauvegarde n'est disponible (jamais 'telechargement', rien à télécharger)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ jwt: "jwt-frais", downloadUrls: null, cleChiffreeSauvegarde: null, cleChiffreeCloudBackup: null }), { status: 200 }))
    );
    const etapes: string[] = [];

    await verifierEtRestaurerInstallation("motdepasseAdminExistant", creerFakeRestoreService(), (etape) => etapes.push(etape));

    expect(etapes).toEqual(["verification"]);
  });

  // La suite ("telechargement" → "restauration" → "finalisation", chemin
  // avec sauvegarde disponible) exige `app.getPath()` (Electron réel) dès
  // que `downloadUrls` est non-null — même limite que les tests
  // ci-dessus, voir leur commentaire : hors scope ici.
});

/**
 * Barre de progression du téléchargement avec Mo réels (2026-10-23) —
 * `telechargerSauvegardeAvecProgression` testée DIRECTEMENT (jamais via
 * `verifierEtRestaurerInstallation`, qui exige `app.getPath()` dès que
 * `downloadUrls` est non-null — voir le commentaire ci-dessus) : aucune
 * dépendance à Electron ici, uniquement un vrai `ReadableStream` simulant
 * un flux réseau morceau par morceau.
 */
describe("telechargerSauvegardeAvecProgression — progression réelle, octet par octet", () => {
  const DOSSIER_CACHE_TEST = join(tmpdir(), `maxiequip-test-cache-${Math.random()}`);

  afterEach(() => {
    vi.unstubAllGlobals();
    if (existsSync(DOSSIER_CACHE_TEST)) rmSync(DOSSIER_CACHE_TEST, { recursive: true, force: true });
  });

  function creerStreamMorceaux(taillesOctets: number[]): ReadableStream<Uint8Array> {
    let i = 0;
    return new ReadableStream({
      pull(controller) {
        if (i >= taillesOctets.length) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(taillesOctets[i]!));
        i += 1;
      },
    });
  }

  function sha256DeZeros(taille: number): string {
    return createHash("sha256").update(Buffer.alloc(taille)).digest("hex");
  }

  /** `checksum.json` réel, cohérent avec un contenu de `taille` octets tous à zéro (ce que produisent creerStreamMorceaux/new Uint8Array ci-dessus). */
  function repChecksumValide(taille: number): Response {
    return new Response(JSON.stringify({ sha256: sha256DeZeros(taille), tailleOctets: taille }), { status: 200, headers: { "content-length": "60" } });
  }

  it("rapporte les octets reçus morceau par morceau, et le total exact = la taille de database.sqlite (metadata/checksum négligeables, hors suivi)", async () => {
    const repDatabase = new Response(creerStreamMorceaux([1000, 2000, 1500]), { status: 200, headers: { "content-length": "4500" } });
    const repMetadata = new Response(new Uint8Array(50), { status: 200, headers: { "content-length": "50" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("database")) return repDatabase;
        if (url.includes("metadata")) return repMetadata;
        return repChecksumValide(4500);
      })
    );

    const appels: { recuOctets: number; totalOctets: number | null }[] = [];
    const resultat = await telechargerSauvegardeAvecProgression(
      { database: "https://x.test/database", metadata: "https://x.test/metadata", checksum: "https://x.test/checksum" },
      (_etape, detail) => {
        if (detail) appels.push(detail);
      }
    );

    expect(resultat.database.length).toBe(4500);
    expect(resultat.metadata.length).toBe(50);
    expect(resultat.depuisCache).toBe(false);

    // Plusieurs appels (jamais un seul "tout ou rien" à la fin) — preuve
    // que la progression est réellement rapportée au fil du flux.
    expect(appels.length).toBeGreaterThan(1);
    // Jamais décroissant — un compteur qui recule serait une barre qui
    // "recule" visuellement, jamais acceptable pour l'utilisateur.
    for (let i = 1; i < appels.length; i++) {
      expect(appels[i]!.recuOctets).toBeGreaterThanOrEqual(appels[i - 1]!.recuOctets);
    }
    const dernier = appels[appels.length - 1]!;
    expect(dernier.recuOctets).toBe(4500);
    expect(dernier.totalOctets).toBe(4500);
  });

  it("totalOctets = null si database.sqlite n'a pas de Content-Length — jamais une taille partielle trompeuse", async () => {
    const repDatabase = new Response(new Uint8Array(100), { status: 200 }); // pas de content-length
    const repMetadata = new Response(new Uint8Array(50), { status: 200, headers: { "content-length": "50" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("database")) return repDatabase;
        if (url.includes("metadata")) return repMetadata;
        return repChecksumValide(100);
      })
    );

    const appels: { recuOctets: number; totalOctets: number | null }[] = [];
    await telechargerSauvegardeAvecProgression(
      { database: "https://x.test/database", metadata: "https://x.test/metadata", checksum: "https://x.test/checksum" },
      (_etape, detail) => {
        if (detail) appels.push(detail);
      }
    );

    expect(appels.length).toBeGreaterThan(0);
    expect(appels.every((a) => a.totalOctets === null)).toBe(true);
  });

  it("une réponse HTTP en échec (ex. 500) fait échouer tout le téléchargement, jamais un résultat partiel silencieux", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("database")) return new Response(null, { status: 500 });
        if (url.includes("metadata")) return new Response(new Uint8Array(10), { status: 200, headers: { "content-length": "10" } });
        return repChecksumValide(10);
      })
    );

    await expect(
      telechargerSauvegardeAvecProgression({ database: "https://x.test/database", metadata: "https://x.test/metadata", checksum: "https://x.test/checksum" })
    ).rejects.toThrow(/database.*HTTP 500/);
  });

  // --- Cache local (2026-10-24, retour utilisateur : "si je relance, ça
  // va retélécharger et retomber sur le plafond B2") ---

  it("CACHE — un fichier déjà présent au chemin de cache, correspondant exactement au SHA-256/à la taille annoncés, est réutilisé SANS aucune requête réseau pour database.sqlite", async () => {
    const taille = 2048;
    const donnees = Buffer.alloc(taille, 7); // non-zéro, pour bien distinguer d'un éventuel mauvais contenu
    mkdirSync(DOSSIER_CACHE_TEST, { recursive: true });
    const cheminCache = join(DOSSIER_CACHE_TEST, "database.sqlite");
    writeFileSync(cheminCache, donnees);

    const appelsFetch: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        appelsFetch.push(url);
        if (url.includes("database")) throw new Error("NE DOIT JAMAIS être appelé — le cache doit être utilisé à la place.");
        if (url.includes("metadata")) return new Response(new Uint8Array(5), { status: 200, headers: { "content-length": "5" } });
        return new Response(JSON.stringify({ sha256: createHash("sha256").update(donnees).digest("hex"), tailleOctets: taille }), { status: 200 });
      })
    );

    const appelsProgression: { recuOctets: number; totalOctets: number | null }[] = [];
    const resultat = await telechargerSauvegardeAvecProgression(
      { database: "https://x.test/database", metadata: "https://x.test/metadata", checksum: "https://x.test/checksum" },
      (_etape, detail) => {
        if (detail) appelsProgression.push(detail);
      },
      cheminCache
    );

    expect(resultat.depuisCache).toBe(true);
    expect(resultat.database.equals(donnees)).toBe(true);
    expect(appelsFetch.every((u) => !u.includes("database"))).toBe(true); // jamais de requête réseau vers l'URL database
    expect(appelsProgression).toEqual([{ recuOctets: taille, totalOctets: taille }]); // progression instantanée, cohérente pour l'UI
  });

  it("CACHE — un fichier en cache qui NE correspond PAS au SHA-256 annoncé (sauvegarde plus récente, ou cache corrompu) déclenche un vrai retéléchargement, jamais une réutilisation incorrecte", async () => {
    mkdirSync(DOSSIER_CACHE_TEST, { recursive: true });
    const cheminCache = join(DOSSIER_CACHE_TEST, "database.sqlite");
    writeFileSync(cheminCache, Buffer.from("ancien contenu, plus a jour"));

    const nouveauContenu = Buffer.alloc(300, 9);
    const repDatabase = new Response(nouveauContenu, { status: 200, headers: { "content-length": "300" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("database")) return repDatabase;
        if (url.includes("metadata")) return new Response(new Uint8Array(5), { status: 200, headers: { "content-length": "5" } });
        return new Response(JSON.stringify({ sha256: createHash("sha256").update(nouveauContenu).digest("hex"), tailleOctets: 300 }), { status: 200 });
      })
    );

    const resultat = await telechargerSauvegardeAvecProgression(
      { database: "https://x.test/database", metadata: "https://x.test/metadata", checksum: "https://x.test/checksum" },
      undefined,
      cheminCache
    );

    expect(resultat.depuisCache).toBe(false);
    expect(resultat.database.equals(nouveauContenu)).toBe(true);
    // Le cache est mis à jour avec le nouveau contenu, pour la prochaine fois.
    expect(readFileSync(cheminCache).equals(nouveauContenu)).toBe(true);
  });

  it("CACHE — un téléchargement réussi SANS cache préexistant écrit le fichier au chemin de cache pour une tentative future", async () => {
    const donnees = Buffer.alloc(150, 3);
    const cheminCache = join(DOSSIER_CACHE_TEST, "database.sqlite");
    expect(existsSync(cheminCache)).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("database")) return new Response(donnees, { status: 200, headers: { "content-length": "150" } });
        if (url.includes("metadata")) return new Response(new Uint8Array(5), { status: 200, headers: { "content-length": "5" } });
        return new Response(JSON.stringify({ sha256: createHash("sha256").update(donnees).digest("hex"), tailleOctets: 150 }), { status: 200 });
      })
    );

    await telechargerSauvegardeAvecProgression(
      { database: "https://x.test/database", metadata: "https://x.test/metadata", checksum: "https://x.test/checksum" },
      undefined,
      cheminCache
    );

    expect(existsSync(cheminCache)).toBe(true);
    expect(readFileSync(cheminCache).equals(donnees)).toBe(true);
  });
});
