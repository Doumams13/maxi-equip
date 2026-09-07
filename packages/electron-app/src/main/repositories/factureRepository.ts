import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Facture, LigneFacture, LigneReleveInterne } from "@maxi-equip/shared-types";

interface FactureRow {
  id: string;
  numero: string;
  date: string;
  emplacement_id: string;
  client_nom: string;
  client_telephone: string | null;
  client_adresse: string | null;
  vendeur_utilisateur_id: string;
  vendeur_nom_manuel: string | null;
  mode_reglement: string | null;
  total: number;
  statut_livraison: "en_attente" | "livree";
  livree_le: string | null;
  annulee_le: string | null;
  annulee_par: string | null;
  motif_annulation: string | null;
}

function rowToFacture(row: FactureRow, lignes: LigneFacture[]): Facture {
  return {
    id: row.id,
    numero: row.numero,
    date: row.date,
    emplacementId: row.emplacement_id,
    clientNom: row.client_nom,
    clientTelephone: row.client_telephone,
    clientAdresse: row.client_adresse,
    vendeurUtilisateurId: row.vendeur_utilisateur_id,
    vendeurNomManuel: row.vendeur_nom_manuel,
    modeReglement: row.mode_reglement,
    lignes,
    total: row.total,
    statutLivraison: row.statut_livraison,
    livreeLe: row.livree_le,
    annuleeLe: row.annulee_le,
    annuleePar: row.annulee_par,
    motifAnnulation: row.motif_annulation,
    createdAt: "",
    updatedAt: "",
  };
}

export class FactureRepository {
  constructor(private readonly db: Database.Database) {}

  /** Prochain numéro séquentiel FAC-AAAA-XXXX (Phase 0 §6 : numérotation des factures). */
  nextNumero(): string {
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;
    const row = this.db
      .prepare("SELECT numero FROM factures WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1")
      .get(`${prefix}%`) as { numero: string } | undefined;
    const nextSeq = row ? parseInt(row.numero.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  /**
   * Toutes les factures — actives ET annulées (correction : "une facture
   * annulée doit rester visible dans l'onglet Factures", §3). Le statut
   * (actif/annulé) est porté par `annuleeLe`, jamais par l'absence de la
   * ligne — plus aucune facture n'est masquée par cette méthode.
   */
  list(limit = 200): Facture[] {
    const rows = this.db.prepare("SELECT * FROM factures ORDER BY date DESC LIMIT ?").all(limit) as FactureRow[];
    return rows.map((row) => rowToFacture(row, this.getLignes(row.id)));
  }

  findById(id: string): Facture | null {
    const row = this.db.prepare("SELECT * FROM factures WHERE id = ?").get(id) as FactureRow | undefined;
    return row ? rowToFacture(row, this.getLignes(row.id)) : null;
  }

  /** Facture unique avec le nom/rôle du vendeur résolu — utilisé pour la génération du document PDF. */
  findByIdAvecVendeur(id: string): (Facture & { vendeurNom: string | null; vendeurRole: string | null }) | null {
    const facture = this.findById(id);
    if (!facture) return null;
    const u = this.db.prepare("SELECT nom, role FROM utilisateurs WHERE id = ?").get(facture.vendeurUtilisateurId) as
      | { nom: string; role: string }
      | undefined;
    return { ...facture, vendeurNom: u?.nom ?? null, vendeurRole: u?.role ?? null };
  }

  /** Nombre de factures ACTIVES uniquement — indicateurs du dashboard (une facture annulée ne compte jamais). */
  count(): number {
    return (this.db.prepare("SELECT COUNT(*) as n FROM factures WHERE annulee_le IS NULL").get() as { n: number }).n;
  }

  /** Somme des totaux des factures ACTIVES uniquement — chiffre d'affaires (dashboard §3/§13). Une facture annulée ne compte jamais dans le CA. */
  sommeTotal(): number {
    return (this.db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM factures WHERE annulee_le IS NULL").get() as { s: number }).s;
  }

  /** Total facturé sur le mois en cours (factures actives uniquement) — bandeau d'en-tête de l'écran Factures. */
  sommeTotalMoisCourant(): { nombre: number; total: number } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as nombre, COALESCE(SUM(total), 0) as total FROM factures
         WHERE annulee_le IS NULL AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`
      )
      .get() as { nombre: number; total: number };
    return row;
  }

  /**
   * Produits les plus vendus, agrégés depuis les lignes de facture des
   * factures ACTIVES uniquement (§7/§13 d'une correction précédente,
   * complété pour exclure les ventes annulées).
   */
  topProduitsVendus(limite = 5): { label: string; quantite: number }[] {
    const rows = this.db
      .prepare(
        `SELECT lf.motif || ' — ' || lf.taille as label, SUM(lf.quantite) as quantite
         FROM lignes_facture lf
         JOIN factures f ON f.id = lf.facture_id
         WHERE f.annulee_le IS NULL
         GROUP BY lf.motif, lf.taille ORDER BY quantite DESC LIMIT ?`
      )
      .all(limite) as { label: string; quantite: number }[];
    return rows;
  }

  private getLignes(factureId: string): LigneFacture[] {
    return this.db
      .prepare("SELECT produit_id as produitId, motif, taille, quantite, prix_unitaire as prixUnitaire FROM lignes_facture WHERE facture_id = ?")
      .all(factureId) as LigneFacture[];
  }

  /**
   * Crée la facture CLIENT et ses lignes. N'écrit JAMAIS de donnée
   * fournisseur/coût d'achat (le type LigneFacture ne le permet
   * structurellement pas — voir packages/domain/src/invoicing).
   */
  create(input: {
    numero: string;
    date: string;
    emplacementId: string;
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    vendeurUtilisateurId: string;
    vendeurNomManuel: string | null;
    modeReglement: string | null;
    lignes: LigneFacture[];
    total: number;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO factures
         (id, numero, date, emplacement_id, client_nom, client_telephone, client_adresse, vendeur_utilisateur_id, vendeur_nom_manuel, mode_reglement, total, statut_livraison, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?)`
      )
      .run(
        id,
        input.numero,
        input.date,
        input.emplacementId,
        input.clientNom,
        input.clientTelephone,
        input.clientAdresse,
        input.vendeurUtilisateurId,
        input.vendeurNomManuel,
        input.modeReglement,
        input.total,
        now,
        now
      );

    const insertLigne = this.db.prepare(
      `INSERT INTO lignes_facture (id, facture_id, produit_id, motif, taille, quantite, prix_unitaire)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ligne of input.lignes) {
      insertLigne.run(randomUUID(), id, ligne.produitId, ligne.motif, ligne.taille, ligne.quantite, ligne.prixUnitaire);
    }

    return id;
  }

  /** Marque une facture comme livrée (§14 de la correction) — jamais l'inverse depuis cet écran, un statut de livraison ne revient pas en arrière par erreur. */
  marquerLivree(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE factures SET statut_livraison = 'livree', livree_le = ?, updated_at = ? WHERE id = ?").run(now, now, id);
  }

  /**
   * Annulation (§5/§6/§21) — suppression douce uniquement : la facture
   * disparaît des factures actives (`list()` la filtre déjà), mais reste
   * en base avec son motif, consultable via l'historique. Ne touche
   * jamais aux mouvements de stock ni à leur restauration — cette
   * responsabilité appartient à VenteService (règle métier, pas
   * persistance pure).
   */
  annuler(id: string, motif: string, annuleePar: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE factures SET annulee_le = ?, annulee_par = ?, motif_annulation = ?, updated_at = ? WHERE id = ?")
      .run(now, annuleePar, motif, now, id);
  }

  /**
   * Crée le relevé interne d'approvisionnement — table PHYSIQUEMENT
   * séparée de la facture, jamais transmise au client (Corrections §7).
   */
  createReleveInterne(factureId: string, lignes: LigneReleveInterne[]): void {
    if (lignes.length === 0) return;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO releves_internes_approvisionnement (id, facture_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, factureId, now, now);

    const insertLigne = this.db.prepare(
      `INSERT INTO lignes_releve_interne (id, releve_id, motif, taille, quantite, fournisseur, prix_achat, prix_vente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ligne of lignes) {
      insertLigne.run(randomUUID(), id, ligne.motif, ligne.taille, ligne.quantite, ligne.fournisseur, ligne.prixAchat, ligne.prixVente);
    }
  }

  /**
   * Factures avec le nom/rôle du vendeur résolu — Consolidation
   * Administrateur/Gérant §11 : nécessaire pour permettre à
   * l'Administrateur de voir "qui a vendu", information ensuite
   * anonymisée pour le Gérant au niveau IPC (jamais ici — ce dépôt ne
   * fait que fournir la donnée brute).
   */
  listAvecVendeur(limit = 50): (Facture & { vendeurNom: string | null; vendeurRole: string | null })[] {
    const factures = this.list(limit);
    if (factures.length === 0) return [];
    const placeholders = factures.map(() => "?").join(",");
    const utilisateurs = this.db
      .prepare(`SELECT id, nom, role FROM utilisateurs WHERE id IN (${placeholders})`)
      .all(...factures.map((f) => f.vendeurUtilisateurId)) as { id: string; nom: string; role: string }[];
    const parId = new Map(utilisateurs.map((u) => [u.id, u]));
    return factures.map((f) => {
      const u = parId.get(f.vendeurUtilisateurId);
      return { ...f, vendeurNom: u?.nom ?? null, vendeurRole: u?.role ?? null };
    });
  }

  /**
   * Document interne d'approvisionnement — accessible à tous les
   * utilisateurs ayant accès à la vente, sans distinction Admin/Gérant
   * (§9 de la correction). N'existe (au sens utile) que pour les lignes
   * ayant réellement eu un complément externe ; la quantité interne est
   * déduite (quantité totale de la ligne facture − quantité externe
   * enregistrée dans le relevé), jamais stockée deux fois séparément.
   */
  getDocumentInterne(
    factureId: string
  ): { motif: string; taille: string; quantiteTotale: number; quantiteInterne: number; quantiteExterne: number; fournisseur: string | null; prixAchat: number | null }[] {
    const lignesFacture = this.getLignes(factureId);
    const releve = this.db
      .prepare(
        `SELECT lri.motif, lri.taille, lri.quantite, lri.fournisseur, lri.prix_achat as prixAchat
         FROM lignes_releve_interne lri
         JOIN releves_internes_approvisionnement r ON r.id = lri.releve_id
         WHERE r.facture_id = ?`
      )
      .all(factureId) as { motif: string; taille: string; quantite: number; fournisseur: string; prixAchat: number }[];

    return lignesFacture.map((lf) => {
      const externe = releve.find((r) => r.motif === lf.motif && r.taille === lf.taille);
      return {
        motif: lf.motif,
        taille: lf.taille,
        quantiteTotale: lf.quantite,
        quantiteInterne: lf.quantite - (externe?.quantite ?? 0),
        quantiteExterne: externe?.quantite ?? 0,
        fournisseur: externe?.fournisseur ?? null,
        prixAchat: externe?.prixAchat ?? null,
      };
    });
  }

  /**
   * Reconstruit les données d'une vente à partir d'une facture existante
   * (correction §4 : "Modifier" une facture annulée doit préremplir les
   * informations existantes). La répartition par dépôt est reconstruite
   * depuis les mouvements réellement enregistrés pour cette facture —
   * jamais stockée séparément, toujours dérivée de la source de vérité.
   */
  getDonneesPourModification(factureId: string): {
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    modeReglement: string | null;
    lignes: {
      produitId: string | null;
      motif: string;
      taille: string;
      quantite: number;
      prixUnitaire: number;
      allocationsDepots: { emplacementId: string; quantite: number }[];
      fournisseurExterne: string | null;
      prixAchatExterne: number | null;
    }[];
  } | null {
    const facture = this.findById(factureId);
    if (!facture) return null;
    const documentInterne = this.getDocumentInterne(factureId);
    const mouvements = this.db
      .prepare(
        "SELECT produit_id as produitId, emplacement_id as emplacementId, quantite FROM mouvements WHERE facture_id = ? AND type = 'sortie' AND emplacement_id IS NOT NULL"
      )
      .all(factureId) as { produitId: string; emplacementId: string; quantite: number }[];

    return {
      clientNom: facture.clientNom,
      clientTelephone: facture.clientTelephone,
      clientAdresse: facture.clientAdresse,
      modeReglement: facture.modeReglement,
      lignes: facture.lignes.map((l) => {
        const doc = documentInterne.find((d) => d.motif === l.motif && d.taille === l.taille);
        const allocations = mouvements.filter((m) => m.produitId === l.produitId).map((m) => ({ emplacementId: m.emplacementId, quantite: m.quantite }));
        return {
          produitId: l.produitId,
          motif: l.motif,
          taille: l.taille,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          allocationsDepots: allocations,
          fournisseurExterne: doc?.fournisseur ?? null,
          prixAchatExterne: doc?.prixAchat ?? null,
        };
      }),
    };
  }
}
