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

export interface EvenementHistorique {
  id: string;
  type: "vente" | "annulation" | "entree" | "transfert";
  date: string;
  quantite: number | null;
  produitMotif: string | null;
  produitTaille: string | null;
  emplacementNom: string | null;
  emplacementSourceNom: string | null;
  emplacementDestinationNom: string | null;
  factureId: string | null;
  factureNumero: string | null;
  clientNom: string | null;
  montant: number | null;
  motifAnnulation: string | null;
  utilisateurId: string | null;
  utilisateurNom: string | null;
  utilisateurRole: string | null;
}

const SELECT_EVENEMENTS = `
  SELECT * FROM (
    -- Une vente = UN SEUL événement, quel que soit le nombre de dépôts ou
    -- la présence d'un complément externe (correction "1 vente = 1
    -- événement dans l'historique", jamais plusieurs lignes techniques).
    SELECT
      'facture:' || f.id || ':effectuee' as id, 'vente' as type, f.date as date,
      NULL as quantite, NULL as produitMotif, NULL as produitTaille,
      NULL as emplacementNom, NULL as emplacementSourceNom, NULL as emplacementDestinationNom,
      f.id as factureId, f.numero as factureNumero, f.client_nom as clientNom, f.total as montant,
      NULL as motifAnnulation,
      f.vendeur_utilisateur_id as utilisateurId, u1.nom as utilisateurNom, u1.role as utilisateurRole
    FROM factures f
    LEFT JOIN utilisateurs u1 ON u1.id = f.vendeur_utilisateur_id

    UNION ALL

    -- Une annulation = UN SEUL événement supplémentaire (jamais une
    -- "Entrée de stock" — la restauration réelle du stock reste un détail
    -- technique interne, non affiché séparément ici).
    SELECT
      'facture:' || f.id || ':annulee' as id, 'annulation' as type, f.annulee_le as date,
      NULL, NULL, NULL, NULL, NULL, NULL,
      f.id, f.numero, f.client_nom, f.total,
      f.motif_annulation,
      f.annulee_par, u2.nom, u2.role
    FROM factures f
    LEFT JOIN utilisateurs u2 ON u2.id = f.annulee_par
    WHERE f.annulee_le IS NOT NULL

    UNION ALL

    -- Entrées et transferts manuels — jamais liés à une facture, donc
    -- jamais concernés par le regroupement ci-dessus.
    SELECT
      m.id, m.type, m.date,
      m.quantite, p.motif, p.taille,
      e.nom, es.nom, ed.nom,
      NULL, NULL, NULL, NULL,
      NULL,
      m.utilisateur_id, u3.nom, u3.role
    FROM mouvements m
    JOIN produits p ON p.id = m.produit_id
    LEFT JOIN emplacements e ON e.id = m.emplacement_id
    LEFT JOIN emplacements es ON es.id = m.emplacement_source_id
    LEFT JOIN emplacements ed ON ed.id = m.emplacement_destination_id
    LEFT JOIN utilisateurs u3 ON u3.id = m.utilisateur_id
    WHERE m.facture_id IS NULL
  )
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
   * Activité GLOBALE consolidée (§1/§16 de la correction) — un événement
   * "vente" ou "annulation" n'y apparaît qu'UNE SEULE fois, quel que soit
   * le nombre de mouvements techniques sous-jacents.
   */
  listEvenements(limit = 300): EvenementHistorique[] {
    return this.db.prepare(`${SELECT_EVENEMENTS} ORDER BY date DESC LIMIT ?`).all(limit) as EvenementHistorique[];
  }

  /** Activité PERSONNELLE consolidée — filtrée réellement en base sur l'auteur, même principe que listEvenements. */
  listEvenementsPersonnels(utilisateurId: string, limit = 8): EvenementHistorique[] {
    return this.db.prepare(`${SELECT_EVENEMENTS} WHERE utilisateurId = ? ORDER BY date DESC LIMIT ?`).all(utilisateurId, limit) as EvenementHistorique[];
  }

  /** Mouvements liés à une facture — nécessaire pour restaurer le stock lors d'une annulation (correction "Facturation" §5/§21). */
  listParFacture(factureId: string): Mouvement[] {
    const rows = this.db.prepare("SELECT * FROM mouvements WHERE facture_id = ?").all(factureId) as MouvementRow[];
    return rows.map(rowToMouvement);
  }
}
