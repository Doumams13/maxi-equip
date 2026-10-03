import { getConfigurationSync, getConfigurationCloudBackup } from "./syncConfig.js";
import { getEncryptionKey } from "../db/index.js";
import { protegerCleParMotDePasse } from "./backupCrypto.js";

/**
 * `protegerCleParMotDePasse` attend une chaîne HEX (pensé pour la clé
 * SQLCipher) — encodage générique en hex d'un objet JSON quelconque pour
 * réutiliser EXACTEMENT le même mécanisme de chiffrement pour les
 * identifiants CLOUD_BACKUP_*, jamais une seconde primitive cryptographique.
 */
function objetVersHex(valeur: unknown): string {
  return Buffer.from(JSON.stringify(valeur), "utf-8").toString("hex");
}

/**
 * Pousse le mot de passe de récupération d'installation vers le serveur
 * — voir core/recuperationInstallationStore.ts côté API pour le
 * raisonnement complet (réutilise le mot de passe du compte
 * Administrateur, décision utilisateur, plutôt qu'un secret séparé).
 *
 * TOUJOURS "best effort" : ne lève JAMAIS d'exception, n'interrompt
 * JAMAIS la création/le changement de mot de passe local qui vient de
 * réussir. Hors ligne ou serveur injoignable → le mot de passe de
 * récupération reste simplement non à jour côté serveur jusqu'au
 * prochain appel réussi (ex. prochain changement de mot de passe, ou un
 * futur bouton "resynchroniser" dans Paramètres) — jamais bloquant pour
 * l'usage local de l'application (même principe que la synchronisation
 * métier, voir syncService.ts).
 *
 * Le mot de passe en clair transite ICI uniquement en HTTPS vers le
 * serveur qui le hache lui-même (Argon2id) — jamais journalisé, jamais
 * stocké tel quel, jamais routé par boiteEnvoiRepository (dont le
 * journal `operations_synchronisees` est permanent/exporté vers B2 —
 * voir commentaire de core/recuperationInstallationStore.ts côté API).
 */
export async function pousserMotDePasseRecuperation(motDePasse: string): Promise<{ success: boolean; message?: string }> {
  const { apiUrl, jwt } = getConfigurationSync();
  if (!jwt) {
    return { success: false, message: "Synchronisation non configurée — mot de passe de récupération non mis à jour côté serveur." };
  }

  try {
    // La clé de chiffrement SQLCipher de CETTE installation, chiffrée
    // avec ce même mot de passe — jamais en clair sur le réseau ni côté
    // serveur (voir core/recuperationInstallationStore.ts côté API).
    // Permet une restauration cloud complète sur un NOUVEAU poste, ce
    // que le mécanisme de sauvegarde cloud existant ne permettait pas à
    // lui seul (la clé ne quittait jamais la machine d'origine).
    const cleChiffreeSauvegarde = protegerCleParMotDePasse(getEncryptionKey(), motDePasse);

    // Identifiants CLOUD_BACKUP_* de CE poste, chiffrés avec ce même mot
    // de passe — permet à une installation restaurée de reprendre l'envoi
    // de ses propres sauvegardes cloud sans jamais retoucher de variable
    // d'environnement (décision explicite : le propriétaire doit pouvoir
    // s'en sortir seul, même sans contact avec nous). `null` si la
    // sauvegarde cloud n'est pas configurée sur ce poste — jamais bloquant.
    const configCloudBackup = getConfigurationCloudBackup();
    const cleChiffreeCloudBackup = configCloudBackup ? protegerCleParMotDePasse(objetVersHex(configCloudBackup), motDePasse) : null;

    const reponse = await fetch(`${apiUrl}/v1/app/installation/definir-recuperation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ motDePasse, cleChiffreeSauvegarde, cleChiffreeCloudBackup }),
    });
    if (!reponse.ok) {
      return { success: false, message: `Le serveur a refusé la mise à jour (HTTP ${reponse.status}).` };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
    return { success: false, message: `Impossible de contacter le serveur : ${message}` };
  }
}
