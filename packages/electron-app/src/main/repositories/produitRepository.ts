import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Produit } from "@maxi-equip/shared-types";

interface ProduitRow {
  id: string;
  modele_id: string | null;
  motif: string;
  type: string;
  taille: string;
  taille_tri: number;
  largeur: number | null;
  hauteur: number | null;
  reference: string;
  prix: number;
  carreaux_par_carton: number | null;
  seuil_alerte: number;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProduit(row: ProduitRow): Produit {
  return {
    id: row.id,
    modeleId: row.modele_id,
    motif: row.motif,
    type: row.type,
    taille: row.taille,
    tailleTri: row.taille_tri,
    largeur: row.largeur,
    hauteur: row.hauteur,
    reference: row.reference,
    prix: row.prix,
    carreauxParCarton: row.carreaux_par_carton,
    seuilAlerte: row.seuil_alerte,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProduitRepository {
  constructor(private readonly db: Database.Database) {}

  /** Catalogue actif, trié par taille puis motif — cahier des charges §4. */
  list(): Produit[] {
    const rows = this.db
      .prepare("SELECT * FROM produits WHERE deleted_at IS NULL ORDER BY taille_tri, motif")
      .all() as ProduitRow[];
    return rows.map(rowToProduit);
  }

  findById(id: string): Produit | null {
    const row = this.db.prepare("SELECT * FROM produits WHERE id = ?").get(id) as ProduitRow | undefined;
    return row ? rowToProduit(row) : null;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) as n FROM produits WHERE deleted_at IS NULL").get() as { n: number }).n;
  }

  /**
   * Nombre de produits dont le stock CUMULÉ sur les dépôts donnés est sous
   * leur seuil d'alerte — jamais SHOP (décision métier §3/§9 de la
   * correction). Remplace l'ancienne version qui comparait le stock d'un
   * seul emplacement à la fois, ce qui ne correspondait pas à la règle
   * "stock Akébé + Akanda cumulé".
   */
  countSousSeuilDepots(depotIds: string[]): number {
    return this.listSousSeuilDepots(depotIds).length;
  }

  /**
   * Produits sous seuil, avec leur stock cumulé sur les dépôts donnés —
   * section "Produits en stock faible" du dashboard (§8/§13).
   *
   * `modeleId` ajouté (correction "Dashboard cliquable", 2026-10-21) : seul
   * identifiant permettant de retrouver et mettre en surbrillance le bon
   * modèle sur l'écran Carreaux (la liste y est groupée par modèle, pas
   * par variante) — `null` pour une variante antérieure à la migration
   * multi-format, jamais reconstruit rétroactivement.
   */
  listSousSeuilDepots(depotIds: string[]): { id: string; modeleId: string | null; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[] {
    if (depotIds.length === 0) return [];
    const placeholders = depotIds.map(() => "?").join(",");
    // IMPORTANT : HAVING sans GROUP BY n'est pas valide en SQLite sur une
    // requête non agrégée (erreur "HAVING clause on a non-aggregate
    // query", reproduite et confirmée) — le filtre sur la colonne
    // calculée "stock" doit donc se faire via un WHERE sur une
    // sous-requête, pas un HAVING direct.
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT p.id, p.modele_id as modeleId, p.motif, p.type, p.taille, p.seuil_alerte as seuilAlerte,
                  COALESCE((SELECT SUM(s.quantite) FROM stocks s WHERE s.produit_id = p.id AND s.emplacement_id IN (${placeholders})), 0) as stock
           FROM produits p
           WHERE p.deleted_at IS NULL AND p.seuil_alerte > 0
         )
         WHERE stock <= seuilAlerte
         ORDER BY stock ASC`
      )
      .all(...depotIds) as { id: string; modeleId: string | null; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[];
    return rows;
  }

  /** Valeurs déjà utilisées pour "type" — autocomplétion, jamais une liste fermée (cahier des charges §4). */
  distinctTypes(): string[] {
    return (this.db.prepare("SELECT DISTINCT type FROM produits WHERE deleted_at IS NULL ORDER BY type").all() as { type: string }[]).map(
      (r) => r.type
    );
  }

  /** Idem pour "taille". */
  distinctTailles(): string[] {
    return (
      this.db
        .prepare("SELECT DISTINCT taille FROM produits WHERE deleted_at IS NULL ORDER BY taille_tri")
        .all() as { taille: string }[]
    ).map((r) => r.taille);
  }

  /** Variantes d'un modèle donné (actives uniquement). */
  listByModele(modeleId: string): Produit[] {
    const rows = this.db
      .prepare("SELECT * FROM produits WHERE modele_id = ? AND deleted_at IS NULL ORDER BY taille_tri, taille")
      .all(modeleId) as ProduitRow[];
    return rows.map(rowToProduit);
  }

  create(input: {
    modeleId?: string | null;
    motif: string;
    type: string;
    taille: string;
    tailleTri: number;
    largeur?: number | null;
    hauteur?: number | null;
    reference: string;
    prix: number;
    carreauxParCarton?: number | null;
    seuilAlerte: number;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO produits (id, modele_id, motif, type, taille, taille_tri, largeur, hauteur, reference, prix, carreaux_par_carton, seuil_alerte, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.modeleId ?? null,
        input.motif,
        input.type,
        input.taille,
        input.tailleTri,
        input.largeur ?? null,
        input.hauteur ?? null,
        input.reference,
        input.prix,
        input.carreauxParCarton ?? null,
        input.seuilAlerte,
        now,
        now
      );
    return id;
  }

  /**
   * Insère/met à jour une variante reçue du serveur central — correction
   * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
   * Phase 2. Conserve l'`id` EXACT d'origine (même principe que
   * `ModeleRepository.creerDepuisServeur`). La projection catalogue
   * serveur (voir ProduitRow côté API) ne porte PAS motif/type en clair
   * (seulement `modeleId`) — contrairement à cette table locale, qui les
   * dénormalise sur chaque variante (affichage factures/mouvements sans
   * jointure). Résolus ici depuis le modèle local : s'il n'existe pas
   * encore (catalogue pas encore totalement rattrapé, voir
   * SyncService), l'insertion est reportée (jamais un motif/type
   * inventé) — retentée au prochain cycle, exactement comme une
   * violation de clé étrangère ailleurs dans ce projet.
   */
  creerDepuisServeur(produit: {
    id: string;
    modeleId: string | null;
    taille: string;
    tailleTri: number;
    largeur: number | null;
    hauteur: number | null;
    reference: string;
    prix: number;
  }): boolean {
    let motif: string;
    let type: string;
    if (produit.modeleId) {
      const modele = this.db.prepare("SELECT motif, type FROM modeles_produit WHERE id = ?").get(produit.modeleId) as
        | { motif: string; type: string }
        | undefined;
      if (!modele) return false;
      motif = modele.motif;
      type = modele.type;
    } else {
      // Variante "catalogue legacy" sans modèle parent (voir
      // enqueueProduitSync, ipc/metier.ts) — jamais poussée au serveur
      // dans ce cas, donc jamais reçue ici non plus en pratique ; gardé
      // par cohérence avec `create()` ci-dessus, qui accepte aussi un
      // `modeleId` absent.
      motif = produit.reference;
      type = "";
    }

    const now = new Date().toISOString();
    try {
      const existe = this.db.prepare("SELECT id FROM produits WHERE id = ?").get(produit.id) as { id: string } | undefined;
      if (existe) {
        this.db
          .prepare(
            `UPDATE produits SET modele_id = ?, motif = ?, type = ?, taille = ?, taille_tri = ?, largeur = ?, hauteur = ?, reference = ?, prix = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(produit.modeleId, motif, type, produit.taille, produit.tailleTri, produit.largeur, produit.hauteur, produit.reference, produit.prix, now, produit.id);
        return true;
      }
      this.db
        .prepare(
          `INSERT INTO produits (id, modele_id, motif, type, taille, taille_tri, largeur, hauteur, reference, prix, carreaux_par_carton, seuil_alerte, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`
        )
        .run(produit.id, produit.modeleId, motif, type, produit.taille, produit.tailleTri, produit.largeur, produit.hauteur, produit.reference, produit.prix, now, now);
      return true;
    } catch {
      // Violation de clé étrangère (ex. modele_id résolu localement mais
      // supprimé entre-temps) — jamais bloquant, retenté au prochain cycle.
      return false;
    }
  }

  /** Modifie une variante. Ne touche jamais aux images (gérées séparément via ImageService). */
  update(
    id: string,
    input: {
      motif?: string;
      type: string;
      taille: string;
      tailleTri: number;
      largeur?: number | null;
      hauteur?: number | null;
      reference: string;
      prix: number;
      carreauxParCarton?: number | null;
      seuilAlerte: number;
    }
  ): void {
    const now = new Date().toISOString();
    if (input.motif !== undefined) {
      this.db
        .prepare(
          `UPDATE produits
           SET motif = ?, type = ?, taille = ?, taille_tri = ?, largeur = ?, hauteur = ?, reference = ?, prix = ?, carreaux_par_carton = ?, seuil_alerte = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(input.motif, input.type, input.taille, input.tailleTri, input.largeur ?? null, input.hauteur ?? null, input.reference, input.prix, input.carreauxParCarton ?? null, input.seuilAlerte, now, id);
    } else {
      this.db
        .prepare(
          `UPDATE produits
           SET type = ?, taille = ?, taille_tri = ?, largeur = ?, hauteur = ?, reference = ?, prix = ?, carreaux_par_carton = ?, seuil_alerte = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(input.type, input.taille, input.tailleTri, input.largeur ?? null, input.hauteur ?? null, input.reference, input.prix, input.carreauxParCarton ?? null, input.seuilAlerte, now, id);
    }
  }

  /**
   * Suppression douce (Synthèse §9) — le produit n'est jamais détruit
   * physiquement, seulement marqué et tracé. Disparaît du catalogue actif
   * (list(), suggestions) sans perdre l'historique des ventes/mouvements
   * qui le référencent déjà.
   */
  softDelete(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE produits SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?")
      .run(now, deletedBy, now, id);
  }
}
