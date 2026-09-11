import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Protection d'une clé de sauvegarde par mot de passe — correction
 * "Sécurité et clarté des sauvegardes" (suite à la Phase 3.8).
 *
 * PRIMITIVES UTILISÉES, toutes natives `node:crypto`, jamais une
 * cryptographie inventée pour l'occasion :
 * - `scrypt` (dérivation de clé à partir du mot de passe — résistant au
 *   craquage par force brute matérielle, standard reconnu, déjà présent
 *   dans Node sans dépendance supplémentaire).
 * - `AES-256-GCM` (chiffrement authentifié — un mauvais mot de passe
 *   provoque un ÉCHEC EXPLICITE à la déchiffrement, jamais une donnée
 *   corrompue silencieusement acceptée).
 *
 * Le résultat de `protegerCle()` ne contient JAMAIS la clé en clair —
 * uniquement des paramètres publics (sel, IV, paramètres KDF) et la clé
 * chiffrée elle-même. Vérifié réellement avant intégration (voir le
 * rapport de cette correction) : bon mot de passe → récupération
 * correcte ; mauvais mot de passe → échec net (jamais une clé erronée
 * silencieusement acceptée).
 */

const PARAMETRES_SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const TAILLE_CLE_DERIVEE = 32; // 256 bits, pour AES-256-GCM

export interface CleProtegeeParMotDePasse {
  kdf: "scrypt";
  kdfParams: { N: number; r: number; p: number };
  salt: string; // hex
  iv: string; // hex
  cleChiffree: string; // hex — jamais la clé en clair
  tag: string; // hex — tag d'authentification AES-GCM
}

export function protegerCleParMotDePasse(cleHex: string, motDePasse: string): CleProtegeeParMotDePasse {
  const sel = randomBytes(16);
  const cleDerivee = scryptSync(motDePasse, sel, TAILLE_CLE_DERIVEE, PARAMETRES_SCRYPT);
  const iv = randomBytes(12); // 96 bits, taille recommandée pour GCM
  const chiffreur = createCipheriv("aes-256-gcm", cleDerivee, iv);
  const cleChiffree = Buffer.concat([chiffreur.update(Buffer.from(cleHex, "hex")), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();

  return {
    kdf: "scrypt",
    kdfParams: { ...PARAMETRES_SCRYPT },
    salt: sel.toString("hex"),
    iv: iv.toString("hex"),
    cleChiffree: cleChiffree.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/** Lève une exception explicite (jamais une clé erronée silencieuse) si le mot de passe est incorrect — la vérification d'authenticité AES-GCM le garantit. */
export function recupererCleAvecMotDePasse(protection: CleProtegeeParMotDePasse, motDePasse: string): string {
  const sel = Buffer.from(protection.salt, "hex");
  const cleDerivee = scryptSync(motDePasse, sel, TAILLE_CLE_DERIVEE, protection.kdfParams);
  const iv = Buffer.from(protection.iv, "hex");
  const dechiffreur = createDecipheriv("aes-256-gcm", cleDerivee, iv);
  dechiffreur.setAuthTag(Buffer.from(protection.tag, "hex"));
  const cle = Buffer.concat([dechiffreur.update(Buffer.from(protection.cleChiffree, "hex")), dechiffreur.final()]);
  return cle.toString("hex");
}

/** Longueur minimale raisonnable (Partie 6) — jamais des règles excessives, un seul critère simple. */
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;

export function validerMotDePasse(motDePasse: string, confirmation: string): { valide: true } | { valide: false; message: string } {
  if (!motDePasse) return { valide: false, message: "Le mot de passe ne peut pas être vide." };
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) return { valide: false, message: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.` };
  if (motDePasse !== confirmation) return { valide: false, message: "Les deux mots de passe ne correspondent pas." };
  return { valide: true };
}
