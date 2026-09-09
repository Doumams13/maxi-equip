import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";

export interface IdentiteEntreprise {
  nom: string;
  adresse: string;
  quartier: string;
  telephones: string[];
}

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
 *
 * Correction "Paramètres" (identité et coordonnées) : `ville` sert
 * désormais de "Quartier / Localisation" (jamais exposée dans une
 * interface avant cette correction), et les numéros de téléphone
 * vivent dans une table séparée (`telephones_entreprise`), plusieurs
 * numéros étant désormais possibles — l'ancienne colonne `telephone`
 * (un seul numéro) n'est plus écrite, uniquement conservée pour ne
 * perdre aucune donnée existante (migrée une fois, voir migrate.ts).
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

  /** Numéros de téléphone, dans leur ordre d'affichage. */
  getTelephones(): string[] {
    const rows = this.db.prepare("SELECT numero FROM telephones_entreprise ORDER BY ordre ASC").all() as { numero: string }[];
    return rows.map((r) => r.numero);
  }

  /** Identité complète — utilisée par l'écran Paramètres ET par la génération des documents (facture). */
  getIdentite(): IdentiteEntreprise {
    const row = this.db.prepare("SELECT nom, adresse, ville FROM parametres_entreprise WHERE id = 'singleton'").get() as
      | { nom: string; adresse: string; ville: string }
      | undefined;
    return {
      nom: row?.nom ?? "MAXI-EQUIP",
      adresse: row?.adresse ?? "",
      quartier: row?.ville ?? "",
      telephones: this.getTelephones(),
    };
  }

  /**
   * Enregistre l'identité complète en une seule transaction — jamais un
   * état à moitié enregistré. Les téléphones sont entièrement remplacés
   * (supprimés puis réinsérés dans l'ordre fourni) : plus simple et tout
   * aussi fiable qu'une comparaison ligne à ligne pour une liste de cette
   * taille, gérée exclusivement depuis cet écran.
   */
  setIdentite(identite: IdentiteEntreprise): void {
    const nom = identite.nom.trim();
    if (!nom) throw new Error("Le nom du magasin ne peut pas être vide.");
    const telephonesValides = identite.telephones.map((t) => t.trim()).filter((t) => t.length > 0);

    const executer = this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE parametres_entreprise SET nom = ?, adresse = ?, ville = ?, updated_at = ? WHERE id = 'singleton'")
        .run(nom, identite.adresse.trim(), identite.quartier.trim(), now);

      this.db.prepare("DELETE FROM telephones_entreprise").run();
      const insererTelephone = this.db.prepare("INSERT INTO telephones_entreprise (id, numero, ordre, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
      telephonesValides.forEach((numero, index) => {
        insererTelephone.run(randomUUID(), numero, index, now, now);
      });
    });
    executer();
  }
}
