import type Database from "better-sqlite3-multiple-ciphers";

/**
 * Configuration centralisée de l'entreprise — correction "SHOP sur la
 * facture" : le nom du magasin affiché sur les documents ne doit JAMAIS
 * être codé en dur ni confondu avec le nom interne de l'emplacement
 * point-de-vente. Ligne unique ('principal'), extensible pour de futurs
 * paramètres (adresse, téléphone, etc.) sans nouvelle migration lourde.
 */
export class ParametresRepository {
  constructor(private readonly db: Database.Database) {}

  getNomMagasin(): string {
    const row = this.db.prepare("SELECT nom_magasin FROM parametres_entreprise WHERE id = 'principal'").get() as { nom_magasin: string } | undefined;
    // Filet de sécurité si la migration n'a pas encore tourné pour une
    // raison quelconque — jamais un plantage, jamais "SHOP".
    return row?.nom_magasin ?? "MAXI-EQUIP";
  }

  setNomMagasin(nom: string): void {
    const valeur = nom.trim();
    if (!valeur) throw new Error("Le nom du magasin ne peut pas être vide.");
    this.db
      .prepare("INSERT INTO parametres_entreprise (id, nom_magasin, updated_at) VALUES ('principal', ?, ?) ON CONFLICT(id) DO UPDATE SET nom_magasin = excluded.nom_magasin, updated_at = excluded.updated_at")
      .run(valeur, new Date().toISOString());
  }
}
