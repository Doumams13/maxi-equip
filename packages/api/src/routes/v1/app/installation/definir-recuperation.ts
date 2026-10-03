import type { Route } from "../../../../core/types.js";
import { ValidationError } from "../../../../core/errors.js";
import { definirRecuperation } from "../../../../core/recuperationInstallationStore.js";

/**
 * POST /v1/app/installation/definir-recuperation — appelé par l'app
 * Electron juste après la création du compte Administrateur initial, et
 * à chaque changement de son mot de passe (voir ipc/setup.ts et
 * ipc/utilisateurs.ts côté Electron). `trustLevel: "app"` : nécessite
 * déjà un jeton d'installation valide — jamais accessible sans lui,
 * contrairement à la route de vérification (publique par nécessité, voir
 * verifier-recuperation.ts).
 *
 * Reçoit le mot de passe en clair (HTTPS) : c'est la seule façon
 * correcte de laisser le SERVEUR calculer son propre hash Argon2id —
 * jamais un hash pré-calculé côté client, qui figerait le format/les
 * paramètres de hachage entre les deux processus.
 *
 * `cleChiffreeSauvegarde` (optionnel) : blob JSON opaque — la clé de
 * chiffrement SQLCipher de CETTE installation, déjà chiffrée côté
 * Electron avec ce même mot de passe (voir backupCrypto.ts côté
 * Electron). Stocké tel quel, jamais déchiffré ni interprété ici — voir
 * serverStorage.ts pour le raisonnement complet (permet la restauration
 * cloud sur un NOUVEAU poste après vol/panne).
 *
 * `cleChiffreeCloudBackup` (optionnel) : même principe, pour les
 * identifiants CLOUD_BACKUP_* du PC Shop (bucket/région/endpoint/clé B2)
 * — permet à une installation restaurée de reprendre l'upload de ses
 * propres sauvegardes cloud sans jamais retoucher de variable
 * d'environnement (décision explicite de l'utilisateur).
 */
export const definirRecuperationRoute: Route = {
  method: "POST",
  path: "/app/installation/definir-recuperation",
  trustLevel: "app",
  handler: async (req) => {
    const body = req.body as { motDePasse?: unknown; cleChiffreeSauvegarde?: unknown; cleChiffreeCloudBackup?: unknown } | undefined;
    if (!body || typeof body.motDePasse !== "string" || body.motDePasse.length === 0) {
      throw new ValidationError("motDePasse (chaîne non vide) est requis.");
    }
    const cleChiffreeSauvegardeJson = body.cleChiffreeSauvegarde !== undefined ? JSON.stringify(body.cleChiffreeSauvegarde) : null;
    const cleChiffreeCloudBackupJson = body.cleChiffreeCloudBackup !== undefined ? JSON.stringify(body.cleChiffreeCloudBackup) : null;
    await definirRecuperation(body.motDePasse, cleChiffreeSauvegardeJson, cleChiffreeCloudBackupJson);
    return { status: 200, body: { success: true } };
  },
};
