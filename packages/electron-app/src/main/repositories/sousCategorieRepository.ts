import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { SousCategorie, ModelePhysiqueSousCategorie, UniteVente } from "@maxi-equip/shared-types";
import { SousCategorieUniteRepository } from "./sousCategorieUniteRepository.js";

interface SousCategorieRow {
  id: string;
  categorie_id: string;
  nom: string;
  ordre: number;
  modele_physique: ModelePhysiqueSousCategorie | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSousCategorie(row: SousCategorieRow): SousCategorie {
  return {
    id: row.id,
    categorieId: row.categorie_id,
    nom: row.nom,
    ordre: row.ordre,
    modelePhysique: row.modele_physique,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SousCategorieRepository {
  constructor(private readonly db: Database.Database) {}

  list(): SousCategorie[] {
    const rows = this.db.prepare("SELECT * FROM sous_categories WHERE deleted_at IS NULL ORDER BY ordre, nom").all() as SousCategorieRow[];
    return rows.map(rowToSousCategorie);
  }

  listByCategorie(categorieId: string): SousCategorie[] {
    const rows = this.db
      .prepare("SELECT * FROM sous_categories WHERE categorie_id = ? AND deleted_at IS NULL ORDER BY ordre, nom")
      .all(categorieId) as SousCategorieRow[];
    return rows.map(rowToSousCategorie);
  }

  findById(id: string): SousCategorie | null {
    const row = this.db.prepare("SELECT * FROM sous_categories WHERE id = ?").get(id) as SousCategorieRow | undefined;
    return row ? rowToSousCategorie(row) : null;
  }

  create(input: { categorieId: string; nom: string; ordre?: number }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO sous_categories (id, categorie_id, nom, ordre, deleted_at, deleted_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)"
      )
      .run(id, input.categorieId, input.nom.trim(), input.ordre ?? 0, now, now);
    return id;
  }

  update(id: string, input: { nom?: string; ordre?: number }): void {
    const now = new Date().toISOString();
    if (input.nom !== undefined) {
      this.db.prepare("UPDATE sous_categories SET nom = ?, updated_at = ? WHERE id = ?").run(input.nom.trim(), now, id);
    }
    if (input.ordre !== undefined) {
      this.db.prepare("UPDATE sous_categories SET ordre = ?, updated_at = ? WHERE id = ?").run(input.ordre, now, id);
    }
  }

  softDelete(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE sous_categories SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, deletedBy, now, id);
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.4 — insère/met à jour une
   * sous-catégorie reçue du serveur central, ET sa configuration
   * d'unités autorisées (transmise en SOUS-OBJET du payload, jamais une
   * entité séparée — voir PHASE_5_CAHIER_DES_CHARGES.md §4.6/§7.3), dans
   * UNE SEULE transaction englobante. `unitesAutorisees` : `null`/tableau
   * vide → `reinitialiser()` (non configurée, les 6 unités par défaut
   * restent proposées) ; tableau non vide → `definir()` — jamais l'un
   * transmis à l'autre (`definir()` refuse une liste vide, voir
   * `domain/catalogue.validerConfigurationUnites`).
   *
   * TRANSACTION IMBRIQUÉE — vérifié, pas supposé : `Database.transaction()`
   * (better-sqlite3) détecte `db.inTransaction` et utilise un
   * `SAVEPOINT`/`RELEASE`/`ROLLBACK TO` plutôt qu'un second `BEGIN`
   * lorsqu'il est appelé depuis l'intérieur d'une transaction déjà
   * ouverte (voir node_modules/better-sqlite3-multiple-ciphers/lib/methods/transaction.js,
   * `wrapTransaction`) — une exception levée par le SAVEPOINT interne de
   * `SousCategorieUniteRepository.definir()` est donc rattrapée ET
   * RE-LANCÉE après son propre `ROLLBACK TO`, ce qui déclenche à son tour
   * le `ROLLBACK` complet de la transaction englobante ci-dessous (voir
   * le test dédié "rollback complet" dans sousCategorieRepository.test.ts,
   * qui provoque une VRAIE violation de contrainte SQL, jamais un mock).
   *
   * Retourne `false` (jamais d'exception) si `categorieId` ne résout pas
   * encore localement (clé étrangère `sous_categories.categorie_id`,
   * scénario "sous-catégorie reçue avant sa catégorie parente") — même
   * principe de tolérance que `ProduitRepository.creerDepuisServeur`
   * (dépendance au modèle local), retenté au prochain cycle de
   * synchronisation, jamais bloquant.
   */
  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — `deletedAt` optionnel,
   * même raisonnement exact que `CategorieRepository.creerDepuisServeur`
   * (tombstone reçu d'un autre poste, jamais soumis à la garde bloquante
   * locale, aucune cascade sur les modèles qui en dépendent encore).
   */
  creerDepuisServeur(
    sousCategorie: {
      id: string;
      categorieId: string;
      nom: string;
      ordre: number;
      modelePhysique: ModelePhysiqueSousCategorie | null;
      updatedAt: string;
      deletedAt?: string | null;
    },
    unitesAutorisees: UniteVente[] | null
  ): boolean {
    const deletedAt = sousCategorie.deletedAt ?? null;
    const executer = this.db.transaction(() => {
      const existe = this.db.prepare("SELECT id FROM sous_categories WHERE id = ?").get(sousCategorie.id) as { id: string } | undefined;
      if (existe) {
        this.db
          .prepare("UPDATE sous_categories SET categorie_id = ?, nom = ?, ordre = ?, modele_physique = ?, deleted_at = ?, deleted_by = NULL, updated_at = ? WHERE id = ?")
          .run(sousCategorie.categorieId, sousCategorie.nom, sousCategorie.ordre, sousCategorie.modelePhysique, deletedAt, sousCategorie.updatedAt, sousCategorie.id);
      } else {
        this.db
          .prepare(
            `INSERT INTO sous_categories (id, categorie_id, nom, ordre, modele_physique, unites_configurees, deleted_at, deleted_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)`
          )
          .run(sousCategorie.id, sousCategorie.categorieId, sousCategorie.nom, sousCategorie.ordre, sousCategorie.modelePhysique, deletedAt, sousCategorie.updatedAt, sousCategorie.updatedAt);
      }

      const sousCategorieUniteRepository = new SousCategorieUniteRepository(this.db);
      if (unitesAutorisees && unitesAutorisees.length > 0) {
        sousCategorieUniteRepository.definir(sousCategorie.id, unitesAutorisees);
      } else {
        sousCategorieUniteRepository.reinitialiser(sousCategorie.id);
      }
    });

    try {
      executer();
      return true;
    } catch {
      // Violation de clé étrangère (categorie_id pas encore connue
      // localement) OU échec réel d'application des unités — dans les
      // deux cas, la transaction entière a déjà été annulée ci-dessus ;
      // jamais bloquant, retenté au prochain cycle.
      return false;
    }
  }

  /**
   * Nombre de modèles actifs par sous-catégorie. `categorieId` restreint
   * le calcul à une seule catégorie ; omis, il est calculé pour TOUTES
   * les sous-catégories (nécessaire pour un appel sans filtre de
   * catégorie, voir le bug réel corrigé dans le prototype : un appel
   * sans `categorieId` ne doit JAMAIS renvoyer `{}` codé en dur, mais une
   * vraie requête).
   */
  compterModelesParSousCategorie(categorieId?: string): Record<string, number> {
    const rows = (
      categorieId
        ? this.db
            .prepare(
              `SELECT m.sous_categorie_id as sousCategorieId, COUNT(*) as n
               FROM modeles_produit m
               JOIN sous_categories sc ON sc.id = m.sous_categorie_id
               WHERE m.deleted_at IS NULL AND sc.categorie_id = ?
               GROUP BY m.sous_categorie_id`
            )
            .all(categorieId)
        : this.db
            .prepare(
              `SELECT m.sous_categorie_id as sousCategorieId, COUNT(*) as n
               FROM modeles_produit m
               WHERE m.deleted_at IS NULL AND m.sous_categorie_id IS NOT NULL
               GROUP BY m.sous_categorie_id`
            )
            .all()
    ) as { sousCategorieId: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.sousCategorieId, r.n]));
  }
}
