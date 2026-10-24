import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { app } from "electron";
import type { BackupRestoreService, ResultatRestauration } from "./backupRestoreService.js";
import { getConfigurationSync, definirConfigurationSyncLocale, type ConfigurationCloudBackup } from "./syncConfig.js";
import { recupererCleAvecMotDePasse, type CleProtegeeParMotDePasse } from "./backupCrypto.js";

/** Symétrique de objetVersHex() côté recuperationInstallationService.ts. */
function hexVersObjet<T>(hex: string): T {
  return JSON.parse(Buffer.from(hex, "hex").toString("utf-8")) as T;
}

/**
 * Orchestration complète de la récupération d'installation — voir
 * l'échange sur le vol du PC Shop. Contrairement à `backup:restore-*`
 * (ipc/backupRestore.ts), n'exige JAMAIS de session Administrateur déjà
 * ouverte : c'est justement le mécanisme qui en tient lieu pour une
 * installation fraîche, où aucun compte local n'existe encore (voir le
 * garde `estSetupRequis()` dans le handler IPC qui appelle ceci).
 *
 * Réutilise le format de sauvegarde manuelle existant
 * (`BackupRestoreService.executerRestauration`, qui attend un dossier
 * avec `database.sqlite` + `metadata.json`, ce dernier contenant
 * `database.keyProtection` pour une sauvegarde protégée par mot de
 * passe) — la sauvegarde cloud automatique ne contient PAS ce champ
 * nativement (voir cloudBackupService.ts : la clé ne quitte jamais la
 * machine d'origine), donc injecté ici après téléchargement, à partir de
 * `cleChiffreeSauvegarde` obtenu du serveur (voir
 * core/recuperationInstallationStore.ts côté API) — jamais une deuxième
 * logique de restauration inventée.
 */

export type EtapeRecuperation =
  | "aucune_recuperation_configuree"
  | "mot_de_passe_incorrect"
  | "trop_de_tentatives"
  | "aucune_sauvegarde_disponible"
  | "erreur_reseau"
  | "restauration";

/**
 * Progression (2026-10-22, retour utilisateur visuel : "on ne voit rien
 * pendant le téléchargement") — DISTINCT de `EtapeRecuperation` ci-dessus
 * (qui ne décrit que des motifs d'ÉCHEC) : ces valeurs décrivent une
 * opération EN COURS, poussées au Renderer via `onProgress` au fil de
 * l'exécution, jamais renvoyées dans le résultat final. Callback
 * OPTIONNEL (jamais un site d'appel existant cassé — voir les tests qui
 * appellent cette fonction sans ce paramètre).
 */
export type EtapeProgressionRecuperation = "verification" | "telechargement" | "restauration" | "finalisation";

/**
 * Détail octet-par-octet (2026-10-23, retour utilisateur : "une barre de
 * progression avec le téléchargement en Mo") — renseigné UNIQUEMENT
 * pendant "telechargement", à chaque morceau reçu du flux réseau.
 * `totalOctets: null` quand le serveur ne renvoie aucun en-tête
 * Content-Length pour au moins un des 3 fichiers — jamais une taille
 * inventée pour combler l'inconnue, le Renderer doit alors se rabattre
 * sur un indicateur sans pourcentage précis.
 */
export interface DetailProgressionTelechargement {
  recuOctets: number;
  totalOctets: number | null;
}

export interface ResultatRecuperationInstallation {
  success: boolean;
  etape?: EtapeRecuperation;
  message?: string;
}

interface ReponseVerification {
  jwt: string;
  downloadUrls: { database: string; metadata: string; checksum: string } | null;
  cleChiffreeSauvegarde: CleProtegeeParMotDePasse | null;
  cleChiffreeCloudBackup: CleProtegeeParMotDePasse | null;
}

/**
 * Déchiffre les identifiants CLOUD_BACKUP_* reçus du serveur (voir
 * recuperationInstallationService.ts pour le chiffrement symétrique) —
 * `undefined` si absent ou si le déchiffrement échoue (mot de passe
 * différent de celui utilisé à l'envoi, ne devrait jamais arriver ici
 * puisque c'est LE MÊME mot de passe déjà vérifié par le serveur, mais
 * jamais un crash pour autant : la restauration de la base reste prioritaire).
 */
function dechiffrerCloudBackup(blob: CleProtegeeParMotDePasse | null, motDePasse: string): ConfigurationCloudBackup | undefined {
  if (!blob) return undefined;
  try {
    return hexVersObjet<ConfigurationCloudBackup>(recupererCleAvecMotDePasse(blob, motDePasse));
  } catch {
    return undefined;
  }
}

function calculerSha256(donnees: Buffer): string {
  return createHash("sha256").update(donnees).digest("hex");
}

/**
 * Télécharge la sauvegarde EN STREAMING (`ReadableStream`, jamais
 * `arrayBuffer()` d'un coup, qui ne laisserait remonter aucune
 * progression avant la toute fin) — `metadata.json`/`checksum.json` sont
 * négligeables en taille (quelques centaines d'octets) et téléchargés
 * directement, sans suivi de progression dédié ; seul `database.sqlite`
 * (le gros fichier) alimente `onProgress("telechargement", ...)`.
 * `totalOctets` = en-tête `Content-Length` de CE SEUL fichier,
 * uniquement s'il est connu (sinon `null` — jamais une estimation
 * trompeuse).
 *
 * CACHE (2026-10-24, retour utilisateur : "si je relance, ça va
 * retélécharger et retomber sur le plafond B2") — `cheminCacheDatabase`
 * OPTIONNEL (jamais cassé pour les appels existants, dont les tests, qui
 * continuent de toujours télécharger) : si fourni et qu'un fichier déjà
 * présent à ce chemin correspond EXACTEMENT au SHA-256/à la taille
 * annoncés par `checksum.json` (donc : la MÊME sauvegarde, pas une
 * ancienne version), il est réutilisé tel quel — aucune requête réseau
 * pour `database.sqlite`, donc aucune consommation de bande passante B2.
 * Sinon, le fichier téléchargé est écrit à ce chemin pour une tentative
 * future (voir verifierEtRestaurerInstallation : supprimé uniquement
 * après un succès complet, jamais après un échec survenu APRÈS le
 * téléchargement comme un mot de passe incorrect).
 */
export async function telechargerSauvegardeAvecProgression(
  urls: { database: string; metadata: string; checksum: string },
  onProgress?: (etape: "telechargement", detail: DetailProgressionTelechargement) => void,
  cheminCacheDatabase?: string
): Promise<{ database: Buffer; metadata: Buffer; checksum: Buffer; depuisCache: boolean }> {
  const [repMetadata, repChecksum] = await Promise.all([fetch(urls.metadata), fetch(urls.checksum)]);
  for (const [reponse, nom] of [
    [repMetadata, "metadata"],
    [repChecksum, "checksum"],
  ] as const) {
    if (!reponse.ok) throw new Error(`Téléchargement échoué (${nom}, HTTP ${reponse.status}).`);
  }
  const metadata = Buffer.from(await repMetadata.arrayBuffer());
  const checksum = Buffer.from(await repChecksum.arrayBuffer());
  const checksumAttendu = JSON.parse(checksum.toString("utf-8")) as { sha256: string; tailleOctets: number };

  if (cheminCacheDatabase && existsSync(cheminCacheDatabase)) {
    const donneesCache = readFileSync(cheminCacheDatabase);
    if (donneesCache.length === checksumAttendu.tailleOctets && calculerSha256(donneesCache) === checksumAttendu.sha256) {
      onProgress?.("telechargement", { recuOctets: donneesCache.length, totalOctets: donneesCache.length });
      return { database: donneesCache, metadata, checksum, depuisCache: true };
    }
    // Cache présent mais obsolète (sauvegarde plus récente disponible)
    // ou corrompu — retéléchargement normal ci-dessous, jamais bloquant.
  }

  const repDatabase = await fetch(urls.database);
  if (!repDatabase.ok) throw new Error(`Téléchargement échoué (database, HTTP ${repDatabase.status}).`);
  const enteteTaille = repDatabase.headers.get("content-length");
  const totalOctets = enteteTaille !== null && enteteTaille !== "" ? Number(enteteTaille) : null;

  let recuOctets = 0;
  let database: Buffer;
  if (!repDatabase.body) {
    // Repli jamais rencontré avec le fetch natif de Node 18+/Electron 28
    // (toujours un ReadableStream) — gardé par défense en profondeur.
    database = Buffer.from(await repDatabase.arrayBuffer());
    recuOctets = database.length;
    onProgress?.("telechargement", { recuOctets, totalOctets });
  } else {
    const lecteur = repDatabase.body.getReader();
    const morceaux: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (value) {
        morceaux.push(value);
        recuOctets += value.byteLength;
        onProgress?.("telechargement", { recuOctets, totalOctets });
      }
    }
    database = Buffer.concat(morceaux);
  }

  // Mise en cache UNIQUEMENT si le contenu correspond réellement au
  // SHA-256 annoncé — jamais un téléchargement potentiellement tronqué
  // mis en cache (la vérification définitive reste de toute façon faite
  // par l'appelant juste après, ceci n'est qu'une optimisation locale).
  if (cheminCacheDatabase && database.length === checksumAttendu.tailleOctets && calculerSha256(database) === checksumAttendu.sha256) {
    try {
      mkdirSync(dirname(cheminCacheDatabase), { recursive: true });
      writeFileSync(cheminCacheDatabase, database);
    } catch {
      // Best-effort — jamais faire échouer la restauration pour un cache qui n'a pas pu être écrit.
    }
  }

  return { database, metadata, checksum, depuisCache: false };
}

export async function verifierEtRestaurerInstallation(
  motDePasse: string,
  restoreService: BackupRestoreService,
  onProgress?: (etape: EtapeProgressionRecuperation, detail?: DetailProgressionTelechargement) => void
): Promise<ResultatRecuperationInstallation> {
  const { apiUrl } = getConfigurationSync();

  onProgress?.("verification");
  let reponseHttp: Response;
  try {
    reponseHttp = await fetch(`${apiUrl}/v1/public/installation/verifier-recuperation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motDePasse }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
    return { success: false, etape: "erreur_reseau", message: `Impossible de contacter le serveur : ${message}` };
  }

  if (reponseHttp.status === 404) {
    return { success: false, etape: "aucune_recuperation_configuree", message: "Aucune récupération n'est configurée sur le serveur." };
  }
  if (reponseHttp.status === 401) {
    return { success: false, etape: "mot_de_passe_incorrect", message: "Mot de passe incorrect." };
  }
  if (reponseHttp.status === 429) {
    return { success: false, etape: "trop_de_tentatives", message: "Trop de tentatives — réessayez plus tard." };
  }
  if (!reponseHttp.ok) {
    return { success: false, message: `Le serveur a refusé la demande (HTTP ${reponseHttp.status}).` };
  }

  const corps = (await reponseHttp.json()) as ReponseVerification;

  if (!corps.downloadUrls) {
    // Mot de passe valide — ce qui prouve qu'une installation existe
    // RÉELLEMENT quelque part avec ce mot de passe de récupération — mais
    // aucune sauvegarde cloud n'est disponible pour restaurer les données
    // ici.
    //
    // DURCISSEMENT (2026-10-22, "plusieurs machines en parallèle") —
    // volontairement NE PAS configurer la synchronisation dans ce cas
    // (contrairement à avant) : le faire laisserait ensuite
    // `creerAdminInitial` (ipc/setup.ts) pousser un NOUVEAU mot de passe
    // de récupération via `pousserMotDePasseRecuperation` — qui ne
    // s'auto-protège que par l'ABSENCE de jwt (voir son commentaire) —
    // et donc écraser silencieusement le mot de passe de récupération
    // d'une installation déjà existante ailleurs (ex. le vrai PC Shop,
    // toujours actif, qui n'a simplement pas encore produit de sauvegarde
    // cloud). Ce poste repart donc ici sur une toute nouvelle installation
    // locale NON synchronisée, jamais sur une configuration de
    // synchronisation à moitié posée qui exposerait cette fenêtre
    // d'écrasement.
    return {
      success: false,
      etape: "aucune_sauvegarde_disponible",
      message:
        "Mot de passe reconnu, mais aucune sauvegarde n'est disponible sur le serveur pour synchroniser ce poste. Si une autre installation existe déjà ailleurs, réessayez plus tard une fois qu'une sauvegarde aura été produite — sinon, vous pouvez configurer ce poste comme une toute nouvelle installation (non synchronisée).",
    };
  }

  const dossierTemp = join(app.getPath("temp"), `maxiequip-restauration-${randomUUID()}`);
  // Chemin STABLE (contrairement à `dossierTemp` ci-dessus, aléatoire et
  // toujours supprimé) — voir le commentaire de
  // telechargerSauvegardeAvecProgression : permet à une tentative future
  // de réutiliser un `database.sqlite` déjà téléchargé si une tentative
  // précédente a échoué APRÈS le téléchargement (mot de passe incorrect,
  // etc.), sans reconsommer la bande passante B2 (plafonnée).
  const cheminCache = join(app.getPath("userData"), "recuperation-cache", "database.sqlite");
  try {
    const { database: donneesBase, metadata: donneesMetadataBrut, checksum: donneesChecksum } = await telechargerSauvegardeAvecProgression(
      corps.downloadUrls,
      onProgress,
      cheminCache
    );

    const checksumAttendu = JSON.parse(donneesChecksum.toString("utf-8")) as { sha256: string; tailleOctets: number };
    const sha256Reel = calculerSha256(donneesBase);
    if (sha256Reel !== checksumAttendu.sha256 || donneesBase.length !== checksumAttendu.tailleOctets) {
      return { success: false, message: "Échec de l'intégrité : le fichier téléchargé ne correspond pas au SHA-256 enregistré à l'envoi." };
    }

    const metadata = JSON.parse(donneesMetadataBrut.toString("utf-8")) as { database: Record<string, unknown> };
    if (corps.cleChiffreeSauvegarde) {
      metadata.database["keyProtection"] = corps.cleChiffreeSauvegarde;
    }

    mkdirSync(dossierTemp, { recursive: true });
    writeFileSync(join(dossierTemp, "database.sqlite"), donneesBase);
    writeFileSync(join(dossierTemp, "metadata.json"), JSON.stringify(metadata));

    onProgress?.("restauration");
    const resultat: ResultatRestauration = await restoreService.executerRestauration(dossierTemp, motDePasse);
    if (!resultat.success) {
      return { success: false, etape: "restauration", message: resultat.message };
    }

    onProgress?.("finalisation");
    // Uniquement après un succès RÉEL de la restauration locale — voir
    // commentaire d'en-tête, jamais un état intermédiaire ambigu.
    definirConfigurationSyncLocale({
      apiUrl,
      jwt: corps.jwt,
      cloudBackup: dechiffrerCloudBackup(corps.cleChiffreeCloudBackup, motDePasse),
    });
    // Succès complet : le cache de téléchargement n'a plus de raison
    // d'être — nettoyage best-effort, jamais bloquant pour le succès déjà acquis.
    try {
      rmSync(cheminCache, { force: true });
    } catch {
      // Ignoré volontairement.
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return { success: false, message: `Échec du téléchargement/restauration : ${message}` };
  } finally {
    // `cheminCache` n'est JAMAIS supprimé ici (contrairement à
    // `dossierTemp` ci-dessous) — uniquement après le succès complet
    // ci-dessus. Un échec survenu APRÈS le téléchargement (mot de passe
    // incorrect, restauration refusée...) laisse le cache intact pour
    // qu'une nouvelle tentative n'ait pas à retélécharger.
    if (existsSync(dossierTemp)) {
      try {
        rmSync(dossierTemp, { recursive: true, force: true });
      } catch {
        // Nettoyage best-effort — jamais faire échouer la restauration pour ça.
      }
    }
  }
}
