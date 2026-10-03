import { getStorage } from "./storeServeur.js";
import { hasherMotDePasse, verifierMotDePasse } from "./argon2Hasher.js";

/**
 * Mot de passe de récupération d'installation — permet à une nouvelle
 * installation (PC Shop remplacé après vol/panne) de se réauthentifier
 * elle-même auprès du serveur SANS accès SSH au VPS (voir échange sur le
 * vol du PC Shop). Réutilise volontairement le mot de passe du compte
 * Administrateur local (décision utilisateur) plutôt qu'un secret séparé
 * — ce module ne stocke donc PAS ce mot de passe lui-même, seulement son
 * hash Argon2id, recalculé côté serveur à chaque définition/changement.
 *
 * Singleton (même principe que identiteStore.ts) : un seul hash existe,
 * remplacé à chaque appel de `definirRecuperation` (typiquement à la
 * création du compte Administrateur initial, puis à chaque changement de
 * son mot de passe — voir ipc/setup.ts et ipc/utilisateurs.ts côté
 * Electron).
 *
 * `cleChiffreeSauvegardeJson` : voir serverStorage.ts — un blob OPAQUE
 * (JSON sérialisé de `CleProtegeeParMotDePasse`, côté Electron) que ce
 * module ne déchiffre jamais lui-même, se contente de le stocker/
 * renvoyer tel quel à côté du hash.
 */
export async function definirRecuperation(
  motDePasseEnClair: string,
  cleChiffreeSauvegardeJson: string | null,
  cleChiffreeCloudBackupJson: string | null
): Promise<void> {
  const hash = await hasherMotDePasse(motDePasseEnClair);
  await getStorage().definirRecuperation(hash, cleChiffreeSauvegardeJson, cleChiffreeCloudBackupJson);
}

/**
 * Retourne "aucune récupération configurée" (jamais définie) distinctement
 * d'un mot de passe incorrect — permet à l'appli de savoir si elle doit
 * proposer la restauration ou retomber sur la configuration initiale
 * classique (voir routes/v1/public/installation/verifierRecuperation.ts).
 */
export type ResultatVerificationRecuperation = "aucune_recuperation_configuree" | "mot_de_passe_incorrect" | "valide";

export async function verifierRecuperation(motDePasseEnClair: string): Promise<ResultatVerificationRecuperation> {
  const hash = await getStorage().getRecuperationHash();
  if (!hash) return "aucune_recuperation_configuree";
  const valide = await verifierMotDePasse(motDePasseEnClair, hash);
  return valide ? "valide" : "mot_de_passe_incorrect";
}

export function getCleChiffreeSauvegarde(): Promise<string | null> {
  return getStorage().getRecuperationCleChiffree();
}

export function getCleChiffreeCloudBackup(): Promise<string | null> {
  return getStorage().getRecuperationCleChiffreeCloudBackup();
}
