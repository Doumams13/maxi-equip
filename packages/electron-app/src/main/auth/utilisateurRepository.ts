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
