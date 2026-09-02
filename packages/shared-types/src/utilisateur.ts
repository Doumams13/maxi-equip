import type { MetierEntity } from "./common.js";

/**
 * Compte utilisateur. Synthèse §9 : Administrateur et Gérant actifs dès
 * la V1, même poste, même application. Le mot de passe n'apparaît jamais
 * ici en clair — seul un hachage (Argon2id) est persisté, et uniquement
 * côté stockage (jamais transmis tel quel dans les échanges applicatifs).
 */
export type Role = "administrateur" | "gerant";

export interface Utilisateur extends MetierEntity {
  nom: string;
  identifiant: string;
  role: Role;
  actif: boolean;
}
