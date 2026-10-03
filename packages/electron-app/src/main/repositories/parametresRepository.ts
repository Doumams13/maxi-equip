import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";

export interface IdentiteEntreprise {
  nom: string;
  adresse: string;
  quartier: string;
  telephones: string[];
  /**
   * Correction "L'appli gère les infos du site" — colonnes `email`/
   * `whatsapp` de `parametres_entreprise` déjà présentes dans schema.sql
   * depuis l'origine mais jamais lues ni écrites par aucun dépôt ni
   * écran : le site public (packages/site) les affichait donc codées en
   * dur (`siteConfig`), sans aucun moyen réel de les modifier depuis
   * l'application. Chaîne vide = non configuré (même convention que le
   * reste de cette interface), jamais une valeur inventée.
   */
  whatsapp: string;
  email: string;
  /** Correction "Paramètres — Administrateur/Gérant configurables" : `null` = non configuré, jamais une valeur inventée sur les documents. */
  nomAdministrateur: string | null;
  nomGerant: string | null;
  /** Horodatage de dernière modification — permet à la sync de détecter un changement sur ce singleton. */
  updatedAt: string;
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
    const row = this.db
      .prepare("SELECT nom, adresse, ville, whatsapp, email, nom_administrateur, nom_gerant, updated_at FROM parametres_entreprise WHERE id = 'singleton'")
      .get() as
      | { nom: string; adresse: string; ville: string; whatsapp: string; email: string; nom_administrateur: string | null; nom_gerant: string | null; updated_at: string }
      | undefined;
    return {
      nom: row?.nom ?? "MAXI-EQUIP",
      adresse: row?.adresse ?? "",
      quartier: row?.ville ?? "",
      telephones: this.getTelephones(),
      whatsapp: row?.whatsapp ?? "",
      email: row?.email ?? "",
      nomAdministrateur: row?.nom_administrateur ?? null,
      nomGerant: row?.nom_gerant ?? null,
      updatedAt: row?.updated_at ?? new Date(0).toISOString(),
    };
  }

  /**
   * Enregistre l'identité complète en une seule transaction — jamais un
   * état à moitié enregistré. Les téléphones sont entièrement remplacés
   * (supprimés puis réinsérés dans l'ordre fourni) : plus simple et tout
   * aussi fiable qu'une comparaison ligne à ligne pour une liste de cette
   * taille, gérée exclusivement depuis cet écran.
   *
   * Administrateur/Gérant : aucun des deux n'est obligatoire (§8 de la
   * correction — "ne pas bloquer inutilement l'utilisation de
   * l'application"). Une valeur vide est enregistrée comme NULL, jamais
   * comme une chaîne vide, pour que le rendu des documents distingue
   * clairement "non configuré" sans ambiguïté.
   */
  setIdentite(identite: IdentiteEntreprise): void {
    const nom = identite.nom.trim();
    if (!nom) throw new Error("Le nom du magasin ne peut pas être vide.");
    const telephonesValides = identite.telephones.map((t) => t.trim()).filter((t) => t.length > 0);
    const nomAdministrateur = identite.nomAdministrateur?.trim() || null;
    const nomGerant = identite.nomGerant?.trim() || null;
    const whatsapp = identite.whatsapp.trim();
    const email = identite.email.trim();

    const executer = this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE parametres_entreprise SET nom = ?, adresse = ?, ville = ?, whatsapp = ?, email = ?, nom_administrateur = ?, nom_gerant = ?, updated_at = ? WHERE id = 'singleton'"
        )
        .run(nom, identite.adresse.trim(), identite.quartier.trim(), whatsapp, email, nomAdministrateur, nomGerant, now);

      this.db.prepare("DELETE FROM telephones_entreprise").run();
      const insererTelephone = this.db.prepare("INSERT INTO telephones_entreprise (id, numero, ordre, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
      telephonesValides.forEach((numero, index) => {
        insererTelephone.run(randomUUID(), numero, index, now, now);
      });
    });
    executer();
  }
}
