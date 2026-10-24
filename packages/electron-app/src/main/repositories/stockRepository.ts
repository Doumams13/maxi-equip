import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { stock as domainStock } from "@maxi-equip/domain";

/**
 * Accès au stock. Ne contient AUCUNE règle métier (jamais de vérification
 * de disponibilité ici, jamais de décision sur la répartition
 * interne/externe) — ces règles vivent exclusivement dans
 * packages/domain (§19 du prompt Phase 2 : "ne déplace pas une règle
 * métier dans le Renderer" — et par extension, pas non plus dans le
 * repository). Ce dépôt applique seulement les deltas déjà calculés.
 */
export class StockRepository {
  constructor(private readonly db: Database.Database) {}

  getQuantite(produitId: string, emplacementId: string): number {
    const row = this.db
      .prepare("SELECT quantite FROM stocks WHERE produit_id = ? AND emplacement_id = ?")
      .get(produitId, emplacementId) as { quantite: number } | undefined;
    return row?.quantite ?? 0;
  }

  /** Stock de tous les produits pour un emplacement donné. */
  listByEmplacement(emplacementId: string): { produitId: string; quantite: number }[] {
    return this.db
      .prepare("SELECT produit_id as produitId, quantite FROM stocks WHERE emplacement_id = ?")
      .all(emplacementId) as { produitId: string; quantite: number }[];
  }

  /** Stock de TOUS les emplacements pour un seul produit — correction "produit supprimé avec du stock restant" (StockService.ecoulerStockPourSuppression), jamais limité à un seul dépôt. */
  listByProduit(produitId: string): { emplacementId: string; quantite: number }[] {
    return this.db
      .prepare("SELECT emplacement_id as emplacementId, quantite FROM stocks WHERE produit_id = ?")
      .all(produitId) as { emplacementId: string; quantite: number }[];
  }

  /** Stock total (tous emplacements confondus) pour plusieurs produits — colonne "Stock" de la maquette (CarreauxPage). */
  getTotalsForProduits(produitIds: string[]): Map<string, number> {
    if (produitIds.length === 0) return new Map();
    const placeholders = produitIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT produit_id as produitId, SUM(quantite) as total FROM stocks WHERE produit_id IN (${placeholders}) GROUP BY produit_id`)
      .all(...produitIds) as { produitId: string; total: number }[];
    return new Map(rows.map((r) => [r.produitId, r.total]));
  }

  /**
   * Fixe une quantité ABSOLUE — correction "travailler en parallèle sur le
   * même stock" (2026-10-22). Utilisé UNIQUEMENT pour refléter localement
   * la valeur déjà vérifiée/appliquée par le serveur central
   * (ValidationStockDistanteService), jamais pour une saisie utilisateur
   * directe (qui reste toujours `applyDelta`, Corrections §4 : "jamais une
   * valeur absolue"). Sans ça, un stock local resté en retard (une autre
   * machine a vendu entre-temps) ne serait jamais corrigé par un simple
   * delta relatif.
   */
  setQuantite(produitId: string, emplacementId: string, quantite: number): void {
    const existing = this.db.prepare("SELECT id FROM stocks WHERE produit_id = ? AND emplacement_id = ?").get(produitId, emplacementId) as { id: string } | undefined;
    const now = new Date().toISOString();
    if (existing) {
      this.db.prepare("UPDATE stocks SET quantite = ?, updated_at = ? WHERE id = ?").run(quantite, now, existing.id);
    } else {
      this.db
        .prepare(`INSERT INTO stocks (id, produit_id, emplacement_id, quantite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), produitId, emplacementId, quantite, now, now);
    }
  }

  /** Applique un delta (positif ou négatif) — jamais une valeur absolue (Corrections §4). */
  applyDelta(delta: domainStock.StockDelta & { produitId: string }): void {
    const existing = this.db
      .prepare("SELECT id, quantite FROM stocks WHERE produit_id = ? AND emplacement_id = ?")
      .get(delta.produitId, delta.emplacementId) as { id: string; quantite: number } | undefined;
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare("UPDATE stocks SET quantite = quantite + ?, updated_at = ? WHERE id = ?")
        .run(delta.delta, now, existing.id);
    } else {
      this.db
        .prepare(
          `INSERT INTO stocks (id, produit_id, emplacement_id, quantite, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), delta.produitId, delta.emplacementId, delta.delta, now, now);
    }
  }
}
