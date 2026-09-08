import type Database from "better-sqlite3-multiple-ciphers";

/**
 * Configuration centralisée de l'entreprise — correction "SHOP sur la
 * facture" : le nom du magasin affiché sur les documents ne doit JAMAIS
 * être codé en dur ni confondu avec le nom interne de l'emplacement
 * point-de-vente. Réutilise la table `parametres_entreprise` déjà
 * définie dans schema.sql (singleton, colonne `nom`) — bug corrigé :
 * une première version de ce dépôt créait par erreur une SECONDE table
 * du même nom avec une colonne `nom_magasin`, jamais appliquée puisque
 * `CREATE TABLE IF NOT EXISTS` sur la table déjà existante ne faisait
 * rien, d'où l'erreur "no such column: nom_magasin" au démarrage.
 */
export class ParametresRepository {
  constructor(private readonly db: Database.Database) {}

  getNomMagasin(): string {
    const row = this.db.prepare("SELECT nom FROM parametres_entreprise WHERE id = 'singleton'").get() as { nom: string } | undefined;
    // Filet de sécurité si la ligne n'a pas encore été créée pour une
    // raison quelconque — jamais un plantage, jamais "SHOP".
    return row?.nom ?? "MAXI-EQUIP";
  }

  setNomMagasin(nom: string): void {
    const valeur = nom.trim();
    if (!valeur) throw new Error("Le nom du magasin ne peut pas être vide.");
    this.db.prepare("UPDATE parametres_entreprise SET nom = ?, updated_at = ? WHERE id = 'singleton'").run(valeur, new Date().toISOString());
  }
}
