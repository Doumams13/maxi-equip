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
  total: number;
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
    lignes,
    total: row.total,
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

  list(limit = 50): Facture[] {
    const rows = this.db.prepare("SELECT * FROM factures ORDER BY date DESC LIMIT ?").all(limit) as FactureRow[];
    return rows.map((row) => rowToFacture(row, this.getLignes(row.id)));
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) as n FROM factures").get() as { n: number }).n;
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
    lignes: LigneFacture[];
    total: number;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO factures
         (id, numero, date, emplacement_id, client_nom, client_telephone, client_adresse, vendeur_utilisateur_id, vendeur_nom_manuel, total, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
}
