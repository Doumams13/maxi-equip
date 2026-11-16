import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { SousCategorieChamp, TypeChampCaracteristique, RoleChampCaracteristique } from "@maxi-equip/shared-types";

interface SousCategorieChampRow {
  id: string;
  sous_categorie_id: string;
  nom: string;
  type: TypeChampCaracteristique;
  obligatoire: number;
  valeurs_autorisees: string | null;
  unite_mesure: string | null;
  role: RoleChampCaracteristique | null;
  ordre: number;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToChamp(row: SousCategorieChampRow): SousCategorieChamp {
  return {
    id: row.id,
    sousCategorieId: row.sous_categorie_id,
    nom: row.nom,
    type: row.type,
    obligatoire: row.obligatoire === 1,
    valeursAutorisees: row.valeurs_autorisees ? (JSON.parse(row.valeurs_autorisees) as string[]) : null,
    uniteMesure: row.unite_mesure,
    role: row.role,
    ordre: row.ordre,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Champs de caractéristiques suggérés par sous-catégorie — fondations
 * quincaillerie (Phase 1). Entité purement administrative (pas de
 * suppression douce, voir shared-types/categorie.ts).
 */
export class SousCategorieChampRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Phase 5 (référentiel commun), sous-phase 5.3 — nécessaire pour relire
   * l'état complet d'un champ au moment de l'enfilage dans la boîte
   * d'envoi (`enqueueSousCategorieChampSync`, voir ipc/metier.ts), même
   * patron exact que `CategorieRepository.findById`/`SousCategorieRepository.findById`.
   */
  findById(id: string): SousCategorieChamp | null {
    const row = this.db.prepare("SELECT * FROM sous_categorie_champs WHERE id = ?").get(id) as SousCategorieChampRow | undefined;
    return row ? rowToChamp(row) : null;
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — exclut désormais les
   * champs tombstonés (`deleted_at IS NULL`) : ni proposés comme
   * suggestion (`fusionnerCaracteristiquesSuggerees`, voir
   * shared-types/caracteristiques.ts), ni exigés par
   * `validerCaracteristiquesObligatoires` pour un champ obligatoire
   * supprimé, ni listés dans la configuration active d'une
   * sous-catégorie. Les valeurs déjà saisies sur des produits existants
   * restent strictement intactes (liaison par texte, jamais par id —
   * voir caracteristiquesAffichage) : cette méthode ne touche jamais aux
   * produits.
   */
  listBySousCategorie(sousCategorieId: string): SousCategorieChamp[] {
    const rows = this.db
      .prepare("SELECT * FROM sous_categorie_champs WHERE sous_categorie_id = ? AND deleted_at IS NULL ORDER BY ordre, nom")
      .all(sousCategorieId) as SousCategorieChampRow[];
    return rows.map(rowToChamp);
  }

  /** Tous les champs ACTIFS, groupés par sous-catégorie — évite un aller-retour IPC par sous-catégorie côté Renderer. Voir listBySousCategorie ci-dessus pour le filtrage des tombstones. */
  listGroupesParSousCategorie(): Record<string, SousCategorieChamp[]> {
    const rows = this.db.prepare("SELECT * FROM sous_categorie_champs WHERE deleted_at IS NULL ORDER BY ordre, nom").all() as SousCategorieChampRow[];
    const groupes: Record<string, SousCategorieChamp[]> = {};
    for (const row of rows) {
      const champ = rowToChamp(row);
      (groupes[champ.sousCategorieId] ??= []).push(champ);
    }
    return groupes;
  }

  create(input: {
    sousCategorieId: string;
    nom: string;
    ordre?: number;
    type?: TypeChampCaracteristique;
    obligatoire?: boolean;
    valeursAutorisees?: string[] | null;
    uniteMesure?: string | null;
    role?: RoleChampCaracteristique | null;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sous_categorie_champs (id, sous_categorie_id, nom, type, obligatoire, valeurs_autorisees, unite_mesure, role, ordre, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.sousCategorieId,
        input.nom.trim(),
        input.type ?? "texte",
        input.obligatoire ? 1 : 0,
        input.valeursAutorisees ? JSON.stringify(input.valeursAutorisees) : null,
        input.uniteMesure ?? null,
        input.role ?? null,
        input.ordre ?? 0,
        now,
        now
      );
    return id;
  }

  /**
   * Modifie un champ existant sans le recréer (jamais besoin auparavant :
   * seuls create/delete existaient). Chaque propriété omise conserve sa
   * valeur actuelle — ne touche jamais une valeur déjà saisie sur un
   * produit (voir en-tête du fichier).
   */
  update(
    id: string,
    input: {
      nom?: string;
      type?: TypeChampCaracteristique;
      obligatoire?: boolean;
      valeursAutorisees?: string[] | null;
      uniteMesure?: string | null;
      role?: RoleChampCaracteristique | null;
      ordre?: number;
    }
  ): void {
    const existant = this.db.prepare("SELECT * FROM sous_categorie_champs WHERE id = ?").get(id) as SousCategorieChampRow | undefined;
    if (!existant) return;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE sous_categorie_champs
         SET nom = ?, type = ?, obligatoire = ?, valeurs_autorisees = ?, unite_mesure = ?, role = ?, ordre = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.nom !== undefined ? input.nom.trim() : existant.nom,
        input.type ?? existant.type,
        (input.obligatoire !== undefined ? input.obligatoire : existant.obligatoire === 1) ? 1 : 0,
        input.valeursAutorisees !== undefined ? (input.valeursAutorisees ? JSON.stringify(input.valeursAutorisees) : null) : existant.valeurs_autorisees,
        input.uniteMesure !== undefined ? input.uniteMesure : existant.unite_mesure,
        input.role !== undefined ? input.role : existant.role,
        input.ordre ?? existant.ordre,
        now,
        id
      );
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — tombstone, JAMAIS une
   * suppression physique (remplace le `DELETE` historique) : la ligne
   * reste en base, avec `deleted_at`/`deleted_by` renseignés et toutes
   * les autres propriétés PRÉSERVÉES à l'identique. Nécessaire pour que
   * la suppression soit répliquable par upsert LWW vers le serveur
   * (§9 du cahier des charges) et pour que `creerDepuisServeur`
   * (ci-dessous) puisse appliquer ce même tombstone reçu d'un autre
   * poste. Les valeurs déjà saisies sur des produits existants
   * (liaison par texte, jamais par id) restent strictement intactes —
   * cette méthode ne touche jamais à la table `produits`.
   */
  delete(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE sous_categorie_champs SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, deletedBy, now, id);
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.4 — insère/met à jour un
   * champ reçu du serveur central. Même patron exact que
   * `ModeleRepository.creerDepuisServeur` (id serveur conservé tel quel,
   * `UPDATE` si déjà présent sinon `INSERT`), avec deux différences
   * justifiées :
   *
   * - Retourne `boolean` (pas `void`) : `sous_categorie_id` est une
   *   clé étrangère vers `sous_categories` (voir migrate.ts) — une
   *   violation (sous-catégorie pas encore connue localement, scénario
   *   "champ reçu avant sa sous-catégorie parente") est rattrapée et
   *   renvoie `false`, jamais une exception, retenté au prochain cycle —
   *   même principe que `ProduitRepository.creerDepuisServeur`.
   * - `deletedAt` (optionnel, `null` par défaut) : capacité de
   *   RÉCEPTION d'un tombstone, écrite dans les colonnes `deleted_at`/
   *   `deleted_by` ajoutées par `ajouterColonnesDeletedSousCategorieChampsSiAbsentes`
   *   (migrate.ts). `deletedBy` n'est jamais transmis par le serveur
   *   (aucune projection existante — modèle/compte/emplacement compris —
   *   ne porte cette information, voir serverStorage.ts) : toujours
   *   `null` ici. **Important, vérifié avant d'écrire ce code** : le
   *   catch-up réellement livré en sous-phases 5.1-5.3
   *   (`/v1/app/referentiel/list` → `listerSousCategorieChampsActifs()`,
   *   côté serveur) filtre déjà `WHERE deleted_at IS NULL` — un champ
   *   supprimé N'EST DONC JAMAIS RENVOYÉ par ce chemin aujourd'hui,
   *   exactement comme pour modèle/produit/compte/emplacement (aucun de
   *   ces catch-up ne propage non plus une suppression). Ce paramètre
   *   est donc une capacité PRÊTE ET TESTÉE au niveau de ce repository,
   *   mais actuellement INATTEIGNABLE par le pipeline réseau réel —
   *   l'étendre pour que le serveur transmette aussi les champs
   *   récemment supprimés est une décision distincte, non prise ici (voir
   *   le rapport de cette sous-phase).
   *
   * Ne modifie JAMAIS `delete()` ci-dessus (suppression locale complète
   * réservée à la sous-phase 5.6) ni `listBySousCategorie()`/
   * `listGroupesParSousCategorie()` (qui ne filtrent toujours pas
   * `deleted_at`, par construction hors périmètre de cette sous-phase).
   */
  creerDepuisServeur(champ: {
    id: string;
    sousCategorieId: string;
    nom: string;
    type: TypeChampCaracteristique;
    obligatoire: boolean;
    valeursAutorisees: string[] | null;
    uniteMesure: string | null;
    role: RoleChampCaracteristique | null;
    ordre: number;
    updatedAt: string;
    deletedAt?: string | null;
  }): boolean {
    const deletedAt = champ.deletedAt ?? null;
    const valeursAutoriseesJson = champ.valeursAutorisees ? JSON.stringify(champ.valeursAutorisees) : null;
    try {
      const existe = this.db.prepare("SELECT id FROM sous_categorie_champs WHERE id = ?").get(champ.id) as { id: string } | undefined;
      if (existe) {
        this.db
          .prepare(
            `UPDATE sous_categorie_champs
             SET sous_categorie_id = ?, nom = ?, type = ?, obligatoire = ?, valeurs_autorisees = ?, unite_mesure = ?, role = ?, ordre = ?, deleted_at = ?, deleted_by = NULL, updated_at = ?
             WHERE id = ?`
          )
          .run(
            champ.sousCategorieId,
            champ.nom,
            champ.type,
            champ.obligatoire ? 1 : 0,
            valeursAutoriseesJson,
            champ.uniteMesure,
            champ.role,
            champ.ordre,
            deletedAt,
            champ.updatedAt,
            champ.id
          );
        return true;
      }
      this.db
        .prepare(
          `INSERT INTO sous_categorie_champs (id, sous_categorie_id, nom, type, obligatoire, valeurs_autorisees, unite_mesure, role, ordre, deleted_at, deleted_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(
          champ.id,
          champ.sousCategorieId,
          champ.nom,
          champ.type,
          champ.obligatoire ? 1 : 0,
          valeursAutoriseesJson,
          champ.uniteMesure,
          champ.role,
          champ.ordre,
          deletedAt,
          champ.updatedAt,
          champ.updatedAt
        );
      return true;
    } catch {
      // Violation de clé étrangère (sous_categorie_id pas encore connue
      // localement) — jamais bloquant, retenté au prochain cycle.
      return false;
    }
  }
}
