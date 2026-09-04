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

function rowToAuthentifiable(row: UtilisateurRow): auth.UtilisateurAuthentifiable {
  return {
    id: row.id,
    identifiant: row.identifiant,
    passwordHash: row.password_hash,
    role: row.role as Role,
    actif: row.actif === 1,
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
}
