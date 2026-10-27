import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Mouvement } from "@maxi-equip/shared-types";
import { stock as domainStock } from "@maxi-equip/domain";

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
  annule_le: string | null;
  annule_par: string | null;
  motif_annulation: string | null;
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
    annuleLe: row.annule_le,
    annulePar: row.annule_par,
    motifAnnulation: row.motif_annulation,
    createdAt: "",
    updatedAt: "",
  };
}

export interface EvenementHistorique {
  id: string;
  type: "vente" | "annulation" | "entree" | "sortie" | "transfert";
  date: string;
  quantite: number | null;
  produitMotif: string | null;
  produitTaille: string | null;
  produitReference: string | null;
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
  /** Renseigné UNIQUEMENT pour une entrée/sortie manuelle annulée (voir annuler() ci-dessous) — toujours NULL pour vente/annulation/transfert. */
  annuleLe: string | null;
}

const SELECT_EVENEMENTS = `
  SELECT * FROM (
    -- Une vente = UN SEUL événement, quel que soit le nombre de dépôts ou
    -- la présence d'un complément externe (correction "1 vente = 1
    -- événement dans l'historique", jamais plusieurs lignes techniques).
    SELECT
      'facture:' || f.id || ':effectuee' as id, 'vente' as type, f.date as date,
      NULL as quantite, NULL as produitMotif, NULL as produitTaille, NULL as produitReference,
      NULL as emplacementNom, NULL as emplacementSourceNom, NULL as emplacementDestinationNom,
      f.id as factureId, f.numero as factureNumero, f.client_nom as clientNom, f.total as montant,
      NULL as motifAnnulation,
      f.vendeur_utilisateur_id as utilisateurId, u1.nom as utilisateurNom, u1.role as utilisateurRole,
      NULL as annuleLe
    FROM factures f
    LEFT JOIN utilisateurs u1 ON u1.id = f.vendeur_utilisateur_id

    UNION ALL

    -- Une annulation = UN SEUL événement supplémentaire (jamais une
    -- "Entrée de stock" — la restauration réelle du stock reste un détail
    -- technique interne, non affiché séparément ici).
    SELECT
      'facture:' || f.id || ':annulee' as id, 'annulation' as type, f.annulee_le as date,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      f.id, f.numero, f.client_nom, f.total,
      f.motif_annulation,
      f.annulee_par, u2.nom, u2.role,
      NULL
    FROM factures f
    LEFT JOIN utilisateurs u2 ON u2.id = f.annulee_par
    WHERE f.annulee_le IS NOT NULL

    UNION ALL

    -- Entrées et transferts manuels — jamais liés à une facture, donc
    -- jamais concernés par le regroupement ci-dessus. annuleLe et
    -- motifAnnulation réels (correction "corriger une erreur de saisie
    -- de stock") — jamais supprimé, un mouvement annulé reste visible ici
    -- avec son motif, exactement comme une facture annulée ci-dessus.
    SELECT
      m.id, m.type, m.date,
      m.quantite, p.motif, p.taille, p.reference,
      e.nom, es.nom, ed.nom,
      NULL, NULL, NULL, NULL,
      m.motif_annulation,
      m.utilisateur_id, u3.nom, u3.role,
      m.annule_le
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

  /** Historique COMPLET des entrées de stock — jamais limité (correction "Entrée de stock / Transferts" §2 : "l'utilisateur doit pouvoir accéder à l'intégralité"). Pagination/recherche/tri gérés côté écran. */
  listEntrees(): EvenementHistorique[] {
    return this.db.prepare(`SELECT * FROM (${SELECT_EVENEMENTS}) WHERE type = 'entree' ORDER BY date DESC`).all() as EvenementHistorique[];
  }

  /** Historique COMPLET des sorties de stock — même principe que listEntrees. */
  listSorties(): EvenementHistorique[] {
    return this.db.prepare(`SELECT * FROM (${SELECT_EVENEMENTS}) WHERE type = 'sortie' ORDER BY date DESC`).all() as EvenementHistorique[];
  }

  /** Historique COMPLET des transferts — même principe que listEntrees. */
  listTransferts(): EvenementHistorique[] {
    return this.db.prepare(`SELECT * FROM (${SELECT_EVENEMENTS}) WHERE type = 'transfert' ORDER BY date DESC`).all() as EvenementHistorique[];
  }

  /** Historique le plus récent d'abord, limité (cahier des charges §14 — filtres de période à venir en Phase 3+). */
  list(limit = 100): Mouvement[] {
    const rows = this.db.prepare("SELECT * FROM mouvements ORDER BY date DESC LIMIT ?").all(limit) as MouvementRow[];
    return rows.map(rowToMouvement);
  }

  listRecent(limit = 5): Mouvement[] {
    return this.list(limit);
  }

  /** `annuleLe`/`annulePar`/`motifAnnulation` exclus volontairement — un mouvement naît toujours non annulé, voir annuler() ci-dessous pour la seule façon de les renseigner ensuite. */
  create(input: Omit<Mouvement, "id" | "createdAt" | "updatedAt" | "annuleLe" | "annulePar" | "motifAnnulation">): string {
    domainStock.assertCoherentMouvement(input);
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

  /**
   * Somme des quantités pour un type de mouvement — globale si utilisateurId
   * omis, personnelle sinon (§9/§13 de la correction : le filtrage doit
   * être réel, pas visuel).
   *
   * CORRECTION "entrées/sorties gonflées par les annulations" : une
   * annulation de vente restaure le stock via un mouvement "entree" (voir
   * VenteService.annulerVente), SANS jamais retirer la "sortie" d'origine
   * de la vente annulée (les mouvements ne sont jamais effacés — trace
   * complète conservée, visible dans l'Historique). Sans exclusion, une
   * seule vente annulée comptait donc +1 dans "Total sorties" (la vente)
   * ET +1 dans "Total entrées" (la restauration), alors que rien n'est
   * réellement entré ni sorti côté stock une fois tout annulé. Exclut ici
   * les mouvements liés à une facture elle-même annulée, ET (correction
   * "corriger une erreur de saisie de stock") les mouvements manuels
   * eux-mêmes annulés via `annuler()` ci-dessous — un mouvement sans
   * facture et jamais annulé (réassort réel, transfert) n'est jamais
   * affecté, et rien n'est supprimé de l'Historique (uniquement ce calcul
   * agrégé change).
   */
  sommeQuantiteParType(type: Mouvement["type"], utilisateurId?: string): number {
    const exclusionAnnulations = "(m.facture_id IS NULL OR f.annulee_le IS NULL) AND m.annule_le IS NULL";
    if (utilisateurId) {
      return (
        this.db
          .prepare(
            `SELECT COALESCE(SUM(m.quantite), 0) as total FROM mouvements m
             LEFT JOIN factures f ON f.id = m.facture_id
             WHERE m.type = ? AND m.utilisateur_id = ? AND ${exclusionAnnulations}`
          )
          .get(type, utilisateurId) as { total: number }
      ).total;
    }
    return (
      this.db
        .prepare(
          `SELECT COALESCE(SUM(m.quantite), 0) as total FROM mouvements m
           LEFT JOIN factures f ON f.id = m.facture_id
           WHERE m.type = ? AND ${exclusionAnnulations}`
        )
        .get(type) as { total: number }
    ).total;
  }

  /**
   * Bilan d'activité (2026-10-21) — même agrégat que sommeQuantiteParType()
   * ci-dessus (même exclusion des ventes/mouvements annulés), borné à une
   * plage de dates LIBRE [debut, fin] inclusive, jamais filtré par
   * utilisateur (le bilan est une vue Administrateur globale).
   */
  sommeQuantiteParTypeEntre(type: Mouvement["type"], debut: string, fin: string): number {
    return (
      this.db
        .prepare(
          `SELECT COALESCE(SUM(m.quantite), 0) as total FROM mouvements m
           LEFT JOIN factures f ON f.id = m.facture_id
           WHERE m.type = ? AND m.date >= ? AND m.date <= ?
             AND (m.facture_id IS NULL OR f.annulee_le IS NULL) AND m.annule_le IS NULL`
        )
        .get(type, debut, fin) as { total: number }
    ).total;
  }

  /**
   * Bilan d'activité — tableau détaillé par produit (2026-10-22). Distingue,
   * pour chaque produit et sur la période [debut, fin], les sorties liées à
   * une vente ("vendu", `facture_id` non NULL) des sorties manuelles
   * ("sortie", `facture_id` NULL — réassort, casse, etc.) — jamais les
   * transferts (type différent, déjà exclus par le WHERE). Même exclusion
   * que `sommeQuantiteParTypeEntre` ci-dessus (vente annulée, mouvement
   * manuel lui-même annulé) : un produit totalement sans activité sur la
   * période n'apparaît simplement pas dans la Map (0 implicite côté
   * appelant), jamais une ligne à zéro superflue ici.
   */
  detailVenteSortieParProduitEntre(debut: string, fin: string): Map<string, { vendu: number; sortie: number }> {
    const rows = this.db
      .prepare(
        `SELECT m.produit_id as produitId,
           COALESCE(SUM(CASE WHEN m.facture_id IS NOT NULL THEN m.quantite ELSE 0 END), 0) as vendu,
           COALESCE(SUM(CASE WHEN m.facture_id IS NULL THEN m.quantite ELSE 0 END), 0) as sortie
         FROM mouvements m
         LEFT JOIN factures f ON f.id = m.facture_id
         WHERE m.type = 'sortie' AND m.date >= ? AND m.date <= ?
           AND (m.facture_id IS NULL OR f.annulee_le IS NULL) AND m.annule_le IS NULL
         GROUP BY m.produit_id`
      )
      .all(debut, fin) as { produitId: string; vendu: number; sortie: number }[];
    return new Map(rows.map((r) => [r.produitId, { vendu: r.vendu, sortie: r.sortie }]));
  }

  /**
   * Série Entrées/Sorties des 7 derniers jours, un point par jour
   * (§5 de la correction — graphique du dashboard). Un jour sans
   * mouvement retourne explicitement 0, jamais une valeur inventée.
   *
   * Même exclusion que `sommeQuantiteParType` ci-dessus (ventes annulées
   * ET mouvements manuels eux-mêmes annulés) — pour rester cohérent avec
   * les 2 totaux.
   */
  serieEntreesSortiesSeptJours(): { jour: string; entrees: number; sorties: number }[] {
    const rows = this.db
      .prepare(
        `SELECT date(m.date) as jour, m.type as type, SUM(m.quantite) as total FROM mouvements m
         LEFT JOIN factures f ON f.id = m.facture_id
         WHERE date(m.date) >= date('now', '-6 days') AND m.type IN ('entree', 'sortie')
           AND (m.facture_id IS NULL OR f.annulee_le IS NULL) AND m.annule_le IS NULL
         GROUP BY date(m.date), m.type`
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

  /**
   * Correction "Audit Phase 2 — pagination Historique" : remplace le
   * plafond fixe de listEvenements(300) — utilisé par l'Historique
   * général — par une vraie pagination BASE DE DONNÉES. Recherche, type
   * d'opération et période sont appliqués en SQL AVANT de découper en
   * pages (LIMIT/OFFSET), jamais l'inverse — aucune ancienne opération
   * ne devient invisible, quel que soit le nombre total d'événements.
   *
   * `listEvenements(limit)` (ci-dessus) reste INCHANGÉE et continue de
   * servir le Tableau de bord (limite volontaire de 10 pour "activité
   * récente" — un besoin différent, jamais concerné par cette
   * correction).
   *
   * Les bornes de période (dateDebutIso/dateFinIso) sont calculées côté
   * appelant à partir des mêmes règles que l'ancien filtre côté Renderer
   * (jour/semaine/mois/personnalisé), jamais recalculées différemment
   * ici — évite tout risque de divergence de fuseau horaire entre une
   * fonction SQL de date et l'ancien calcul JavaScript.
   */
  listEvenementsPagine(filtres: {
    recherche: string;
    typeFiltre: "tous" | "vente" | "annulation" | "entree" | "sortie" | "transfert";
    dateDebutIso: string | null;
    dateFinIso: string | null;
    colonneTri: "date" | "type" | "montant" | null;
    direction: "asc" | "desc";
    page: number;
    tailleParPage: number;
  }): { resultats: EvenementHistorique[]; totalResultats: number; compteurs: Record<string, number> } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    const q = filtres.recherche.trim();
    if (q) {
      // Correction "recherche Historique par référence produit" (2026-10-27)
      // — le champ affichait "N° facture, client, produit…" mais ne
      // cherchait en réalité QUE sur le motif/la taille, jamais sur la
      // référence (ex. "YMG44057C") pourtant affichée partout ailleurs
      // dans l'app comme identifiant principal d'un produit. Absent des
      // événements "vente" (un seul événement par facture, potentiellement
      // plusieurs produits — voir SELECT_EVENEMENTS), présent pour
      // entrée/sortie/transfert.
      conditions.push("(factureNumero LIKE ? OR clientNom LIKE ? OR produitMotif LIKE ? OR produitTaille LIKE ? OR produitReference LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (filtres.typeFiltre !== "tous") {
      conditions.push("type = ?");
      params.push(filtres.typeFiltre);
    }
    if (filtres.dateDebutIso) {
      conditions.push("date >= ?");
      params.push(filtres.dateDebutIso);
    }
    if (filtres.dateFinIso) {
      conditions.push("date <= ?");
      params.push(filtres.dateFinIso);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const colonnesTri: Record<string, string> = {
      date: "date",
      type: "type",
      montant: "COALESCE(montant, 0)",
    };
    const ordreSql = filtres.colonneTri ? colonnesTri[filtres.colonneTri] : "date";
    const directionSql = filtres.direction === "asc" ? "ASC" : "DESC";

    const totalResultats = (
      this.db.prepare(`SELECT COUNT(*) as n FROM (${SELECT_EVENEMENTS}) ${whereSql}`).get(...params) as { n: number }
    ).n;

    // Répartition par type sur l'ENSEMBLE des résultats filtrés (pas
    // seulement la page affichée) — une requête d'agrégation légère
    // (COUNT groupé), jamais un rechargement de toutes les lignes.
    const lignesCompteurs = this.db
      .prepare(`SELECT type, COUNT(*) as n FROM (${SELECT_EVENEMENTS}) ${whereSql} GROUP BY type`)
      .all(...params) as { type: string; n: number }[];
    const compteurs = Object.fromEntries(lignesCompteurs.map((l) => [l.type, l.n]));

    const offset = (filtres.page - 1) * filtres.tailleParPage;
    const resultats = this.db
      .prepare(`SELECT * FROM (${SELECT_EVENEMENTS}) ${whereSql} ORDER BY ${ordreSql} ${directionSql} LIMIT ? OFFSET ?`)
      .all(...params, filtres.tailleParPage, offset) as EvenementHistorique[];

    return { resultats, totalResultats, compteurs };
  }

  /** Mouvements liés à une facture — nécessaire pour restaurer le stock lors d'une annulation (correction "Facturation" §5/§21). */
  listParFacture(factureId: string): Mouvement[] {
    const rows = this.db.prepare("SELECT * FROM mouvements WHERE facture_id = ?").all(factureId) as MouvementRow[];
    return rows.map(rowToMouvement);
  }

  findById(id: string): Mouvement | null {
    const row = this.db.prepare("SELECT * FROM mouvements WHERE id = ?").get(id) as MouvementRow | undefined;
    return row ? rowToMouvement(row) : null;
  }

  /**
   * Annule un mouvement manuel (entrée/sortie saisie par erreur) —
   * correction "corriger une erreur de saisie de stock sans fausser le
   * tableau de bord". Annote seulement, ne supprime jamais la ligne —
   * reste visible dans l'Historique avec son motif, même principe que
   * `FactureRepository.annuler()`. Le rééquilibrage réel du stock
   * (appliquer le delta inverse) est la responsabilité de l'appelant
   * (StockService.annulerMouvement), jamais de cette méthode, qui ne
   * touche volontairement que la ligne `mouvements` elle-même.
   */
  annuler(id: string, annulePar: string, motif: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE mouvements SET annule_le = ?, annule_par = ?, motif_annulation = ?, updated_at = ? WHERE id = ?")
      .run(now, annulePar, motif, now, id);
  }
}
