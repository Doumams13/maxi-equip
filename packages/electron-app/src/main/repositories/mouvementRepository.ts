import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Mouvement } from "@maxi-equip/shared-types";

interface MouvementRow {
  id: string;
  type: string;
  produit_id: string;
  emplacement_id: string | null;
  emplacement_source_id: string | null;
  emplacement_destination_id: string | null;
  quantite: number;
  date: string;
  facture_id: string | null;
  utilisateur_id: string | null;
  note: string | null;
}

export interface MouvementEnrichi {
  id: string;
  type: string;
  date: string;
  quantite: number;
  produitId: string;
  produitMotif: string;
  produitReference: string;
  produitTaille: string;
  emplacementNom: string | null;
  emplacementSourceNom: string | null;
  emplacementDestinationNom: string | null;
  factureId: string | null;
  factureNumero: string | null;
  clientNom: string | null;
  /** Auteur de l'opération — pour la traçabilité Administrateur (§3/§11 de la correction). Peut être null pour les mouvements enregistrés avant cette évolution. */
  utilisateurId: string | null;
  utilisateurNom: string | null;
  utilisateurRole: string | null;
}

function rowToMouvement(row: MouvementRow): Mouvement {
  return {
    id: row.id,
    type: row.type as Mouvement["type"],
    produitId: row.produit_id,
    emplacementId: row.emplacement_id,
    emplacementSourceId: row.emplacement_source_id,
    emplacementDestinationId: row.emplacement_destination_id,
    quantite: row.quantite,
    date: row.date,
    factureId: row.facture_id,
    utilisateurId: row.utilisateur_id,
    note: row.note,
    createdAt: "",
    updatedAt: "",
  };
}

const SELECT_ENRICHI = `
  SELECT
    m.id, m.type, m.date, m.quantite,
    p.id as produitId, p.motif as produitMotif, p.reference as produitReference, p.taille as produitTaille,
    e.nom as emplacementNom,
    es.nom as emplacementSourceNom,
    ed.nom as emplacementDestinationNom,
    f.id as factureId, f.numero as factureNumero, f.client_nom as clientNom,
    m.utilisateur_id as utilisateurId, u.nom as utilisateurNom, u.role as utilisateurRole
  FROM mouvements m
  JOIN produits p ON p.id = m.produit_id
  LEFT JOIN emplacements e ON e.id = m.emplacement_id
  LEFT JOIN emplacements es ON es.id = m.emplacement_source_id
  LEFT JOIN emplacements ed ON ed.id = m.emplacement_destination_id
  LEFT JOIN factures f ON f.id = m.facture_id
  LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
`;

export class MouvementRepository {
  constructor(private readonly db: Database.Database) {}

  /** Historique le plus récent d'abord, limité (cahier des charges §14 — filtres de période à venir en Phase 3+). */
  list(limit = 100): Mouvement[] {
    const rows = this.db.prepare("SELECT * FROM mouvements ORDER BY date DESC LIMIT ?").all(limit) as MouvementRow[];
    return rows.map(rowToMouvement);
  }

  listRecent(limit = 5): Mouvement[] {
    return this.list(limit);
  }

  create(input: Omit<Mouvement, "id" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mouvements
         (id, type, produit_id, emplacement_id, emplacement_source_id, emplacement_destination_id, quantite, date, facture_id, utilisateur_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.type,
        input.produitId,
        input.emplacementId,
        input.emplacementSourceId,
        input.emplacementDestinationId,
        input.quantite,
        input.date,
        input.factureId,
        input.utilisateurId,
        input.note,
        now,
        now
      );
    return id;
  }

  /** Somme des quantités pour un type de mouvement — globale si utilisateurId omis, personnelle sinon (§9/§13 de la correction : le filtrage doit être réel, pas visuel). */
  sommeQuantiteParType(type: Mouvement["type"], utilisateurId?: string): number {
    if (utilisateurId) {
      return (
        this.db
          .prepare("SELECT COALESCE(SUM(quantite), 0) as total FROM mouvements WHERE type = ? AND utilisateur_id = ?")
          .get(type, utilisateurId) as { total: number }
      ).total;
    }
    return (
      this.db.prepare("SELECT COALESCE(SUM(quantite), 0) as total FROM mouvements WHERE type = ?").get(type) as { total: number }
    ).total;
  }

  /**
   * Série Entrées/Sorties des 7 derniers jours, un point par jour
   * (§5 de la correction — graphique du dashboard). Un jour sans
   * mouvement retourne explicitement 0, jamais une valeur inventée.
   */
  serieEntreesSortiesSeptJours(): { jour: string; entrees: number; sorties: number }[] {
    const rows = this.db
      .prepare(
        `SELECT date(date) as jour, type, SUM(quantite) as total FROM mouvements
         WHERE date(date) >= date('now', '-6 days') AND type IN ('entree', 'sortie')
         GROUP BY date(date), type`
      )
      .all() as { jour: string; type: string; total: number }[];

    const resultat: { jour: string; entrees: number; sorties: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const entree = rows.find((r) => r.jour === iso && r.type === "entree")?.total ?? 0;
      const sortie = rows.find((r) => r.jour === iso && r.type === "sortie")?.total ?? 0;
      resultat.push({ jour: iso, entrees: entree, sorties: sortie });
    }
    return resultat;
  }

  /**
   * Historique enrichi — jointure produit/emplacement(s)/facture/auteur,
   * pour la recherche globale et l'affichage complet de l'Historique
   * (§14-§17 d'une correction précédente). SHOP n'apparaît jamais comme
   * emplacement source/destination d'un mouvement de stock, conformément
   * à la décision métier "SHOP n'a pas de stock".
   */
  listEnrichi(limit = 300): MouvementEnrichi[] {
    return this.db.prepare(`${SELECT_ENRICHI} ORDER BY m.date DESC LIMIT ?`).all(limit) as MouvementEnrichi[];
  }

  /**
   * Activité récente GLOBALE avec auteur — Administrateur uniquement
   * (§3 de la correction : "l'Administrateur doit pouvoir suivre ce que
   * les Gérants font ou ont fait").
   */
  activiteRecenteGlobale(limit = 8): MouvementEnrichi[] {
    return this.db.prepare(`${SELECT_ENRICHI} ORDER BY m.date DESC LIMIT ?`).all(limit) as MouvementEnrichi[];
  }

  /**
   * Activité récente PERSONNELLE — filtrée réellement en base sur
   * l'auteur (§8/§9 de la correction : "ne pas récupérer toutes les
   * données puis masquer visuellement" — le filtre est dans la requête
   * SQL elle-même, jamais après coup côté Renderer).
   */
  activiteRecentePersonnelle(utilisateurId: string, limit = 8): MouvementEnrichi[] {
    return this.db.prepare(`${SELECT_ENRICHI} WHERE m.utilisateur_id = ? ORDER BY m.date DESC LIMIT ?`).all(utilisateurId, limit) as MouvementEnrichi[];
  }
}
