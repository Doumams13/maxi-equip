import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { auth } from "@maxi-equip/domain";
import type { Role } from "@maxi-equip/shared-types";

/**
 * Accès aux données de la table `utilisateurs` (schema.sql, Phase 0).
 * Couche "repository" (§15 du prompt Phase 1) : traduit entre les lignes
 * SQLite et les formes attendues par le domaine — le domaine, lui,
 * n'importe jamais better-sqlite3 directement.
 */

interface UtilisateurRow {
  id: string;
  nom: string;
  identifiant: string;
  password_hash: string;
  role: string;
  actif: number;
  created_at: string;
  updated_at: string;
}

/**
 * Vue publique d'un utilisateur — jamais le hash de mot de passe.
 * Utilisée pour toutes les réponses IPC et le service de gestion.
 */
export interface UtilisateurPublic {
  id: string;
  nom: string;
  identifiant: string;
  role: Role;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToAuthentifiable(row: UtilisateurRow): auth.UtilisateurAuthentifiable {
  return {
    id: row.id,
    identifiant: row.identifiant,
    passwordHash: row.password_hash,
    role: row.role as Role,
    actif: row.actif === 1,
  };
}

function rowToPublic(row: UtilisateurRow): UtilisateurPublic {
  return {
    id: row.id,
    nom: row.nom,
    identifiant: row.identifiant,
    role: row.role as Role,
    actif: row.actif === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UtilisateurRepository {
  constructor(private readonly db: Database.Database) {}

  findByIdentifiant(identifiant: string): auth.UtilisateurAuthentifiable | null {
    const row = this.db
      .prepare("SELECT * FROM utilisateurs WHERE identifiant = ?")
      .get(identifiant) as UtilisateurRow | undefined;
    return row ? rowToAuthentifiable(row) : null;
  }

  findById(id: string): { id: string; nom: string; identifiant: string; role: Role; actif: boolean } | null {
    const row = this.db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(id) as UtilisateurRow | undefined;
    if (!row) return null;
    return { id: row.id, nom: row.nom, identifiant: row.identifiant, role: row.role as Role, actif: row.actif === 1 };
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM utilisateurs").get() as { n: number };
    return row.n;
  }

  /**
   * Crée un utilisateur. `passwordHash` doit déjà être un hachage Argon2id
   * (jamais un mot de passe en clair — vérifié par le type lui-même, qui
   * ne s'appelle pas "password" mais "passwordHash").
   */
  create(input: { nom: string; identifiant: string; passwordHash: string; role: Role }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, input.nom, input.identifiant, input.passwordHash, input.role, now, now);
    return id;
  }

  /**
   * Liste tous les utilisateurs triés par nom ASC — jamais le hash.
   */
  list(): UtilisateurPublic[] {
    const rows = this.db
      .prepare("SELECT * FROM utilisateurs ORDER BY nom ASC")
      .all() as UtilisateurRow[];
    return rows.map(rowToPublic);
  }

  /**
   * Met à jour les champs fournis (nom, role, identifiant) + updated_at.
   */
  update(id: string, input: { nom?: string; role?: Role; identifiant?: string }): void {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.nom !== undefined) {
      fields.push("nom = ?");
      values.push(input.nom);
    }
    if (input.role !== undefined) {
      fields.push("role = ?");
      values.push(input.role);
    }
    if (input.identifiant !== undefined) {
      fields.push("identifiant = ?");
      values.push(input.identifiant);
    }

    if (fields.length === 0) return;

    fields.push("updated_at = ?");
    values.push(now);
    values.push(id);

    this.db
      .prepare(`UPDATE utilisateurs SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
  }

  /**
   * Met à jour uniquement le hash du mot de passe + updated_at.
   * Le paramètre est intentionnellement nommé `hash` pour signaler
   * qu'on attend un hachage Argon2id, jamais un mot de passe en clair.
   */
  updatePasswordHash(id: string, hash: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE utilisateurs SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hash, now, id);
  }

  /** Désactive un utilisateur (actif = 0) + updated_at. */
  deactivate(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE utilisateurs SET actif = 0, updated_at = ? WHERE id = ?")
      .run(now, id);
  }

  /** Réactive un utilisateur (actif = 1) + updated_at. */
  activate(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE utilisateurs SET actif = 1, updated_at = ? WHERE id = ?")
      .run(now, id);
  }

  /**
   * Hash factice — correction "travail à distance / plusieurs machines en
   * parallèle" (2026-10-22). Un compte créé par l'Administrateur puis
   * récupéré ICI pour la première fois via une connexion centrale (voir
   * `upsertDepuisConnexionCentrale`) n'a jamais eu de mot de passe local
   * à stocker (l'authentification réelle a eu lieu côté serveur) — mais
   * la colonne `password_hash` reste NOT NULL. Cette valeur ne PEUT PAS
   * être vérifiée avec succès par Argon2id (jamais un vrai hash) : si la
   * synchronisation est un jour désactivée sur ce poste, la connexion
   * locale échouera proprement pour ce compte plutôt que d'accepter
   * silencieusement n'importe quel mot de passe.
   */
  private static readonly HASH_FACTICE_COMPTE_CENTRAL = "central-sync:aucun-mot-de-passe-local-jamais-verifiable";

  /**
   * Met à jour le miroir local d'un compte authentifié via le serveur
   * central (voir LoginCentralService) — jamais le mot de passe, jamais
   * recalculé localement. Crée la ligne si c'est la première fois que ce
   * poste voit ce compte (nouvelle machine), ou met à jour nom/
   * identifiant/rôle si elle existe déjà (ex. modifié par l'Admin sur un
   * autre poste depuis la dernière connexion ici) — ne touche JAMAIS un
   * `password_hash` déjà présent (celui du tout premier compte
   * Administrateur créé localement, par ex., reste utilisable si la
   * synchronisation est désactivée plus tard).
   */
  upsertDepuisConnexionCentrale(compte: { id: string; identifiant: string; nom: string; role: Role }): void {
    const now = new Date().toISOString();
    const existe = this.db.prepare("SELECT id FROM utilisateurs WHERE id = ?").get(compte.id) as { id: string } | undefined;
    if (existe) {
      this.db
        .prepare("UPDATE utilisateurs SET identifiant = ?, nom = ?, role = ?, actif = 1, updated_at = ? WHERE id = ?")
        .run(compte.identifiant, compte.nom, compte.role, now, compte.id);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(compte.id, compte.nom, compte.identifiant, UtilisateurRepository.HASH_FACTICE_COMPTE_CENTRAL, compte.role, now, now);
  }

  /**
   * Vue COMPLÈTE (avec le hash) — réservée à la synchronisation du
   * compte vers le serveur central (correction "travail à distance /
   * plusieurs machines en parallèle", 2026-10-22, voir
   * UtilisateurService.enqueuerSyncCompte). JAMAIS exposée au Renderer
   * (voir `findById`/`list`, qui renvoient `UtilisateurPublic`, sans
   * hash, pour cet usage).
   */
  findByIdPourSynchronisation(id: string): { id: string; identifiant: string; passwordHash: string; nom: string; role: Role; actif: boolean; updatedAt: string } | null {
    const row = this.db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(id) as UtilisateurRow | undefined;
    if (!row) return null;
    return { id: row.id, identifiant: row.identifiant, passwordHash: row.password_hash, nom: row.nom, role: row.role as Role, actif: row.actif === 1, updatedAt: row.updated_at };
  }

  /** Compte les administrateurs actifs. */
  countAdminActifs(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM utilisateurs WHERE role = 'administrateur' AND actif = 1")
      .get() as { n: number };
    return row.n;
  }

  /**
   * Retourne true si l'identifiant est déjà utilisé par un autre utilisateur.
   * `exceptId` permet d'exclure l'utilisateur en cours de modification.
   */
  identifiantPris(identifiant: string, exceptId?: string): boolean {
    if (exceptId !== undefined) {
      const row = this.db
        .prepare("SELECT COUNT(*) as n FROM utilisateurs WHERE identifiant = ? AND id != ?")
        .get(identifiant, exceptId) as { n: number };
      return row.n > 0;
    }
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM utilisateurs WHERE identifiant = ?")
      .get(identifiant) as { n: number };
    return row.n > 0;
  }
}
