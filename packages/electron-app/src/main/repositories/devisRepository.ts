import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";

/**
 * Devis pro-forma (correction "ajouter les devis pro-forma", 2026-11-13)
 * — type volontairement local à ce fichier, jamais ajouté à
 * `shared-types` : un devis n'est jamais synchronisé entre postes ni
 * transmis au serveur (décision de portée, voir schema.sql) — c'est un
 * brouillon de travail propre à CE poste, contrairement à Facture/
 * Demande qui traversent une frontière process/réseau et ont donc
 * besoin d'un type partagé.
 */
export type DevisStatut = "brouillon" | "convertie" | "annulee";

export interface LigneDevis {
  produitId: string | null;
  motif: string;
  reference: string | null;
  taille: string;
  quantite: number;
  prixUnitaire: number;
}

export interface Devis {
  id: string;
  numero: string;
  date: string;
  clientNom: string;
  clientTelephone: string | null;
  clientAdresse: string | null;
  modeReglement: string | null;
  total: number;
  remise: number;
  statut: DevisStatut;
  /** Renseigné uniquement une fois converti en vente réelle. */
  factureId: string | null;
  utilisateurId: string | null;
  lignes: LigneDevis[];
  createdAt: string;
  updatedAt: string;
}

export interface NouveauDevis {
  clientNom: string;
  clientTelephone?: string | null;
  clientAdresse?: string | null;
  modeReglement?: string | null;
  total: number;
  remise?: number;
  utilisateurId?: string | null;
  lignes: LigneDevis[];
}

interface DevisRow {
  id: string;
  numero: string;
  date: string;
  client_nom: string;
  client_telephone: string | null;
  client_adresse: string | null;
  mode_reglement: string | null;
  total: number;
  remise: number;
  statut: DevisStatut;
  facture_id: string | null;
  utilisateur_id: string | null;
  created_at: string;
  updated_at: string;
}

interface LigneDevisRow {
  id: string;
  devis_id: string;
  produit_id: string | null;
  motif: string;
  reference: string | null;
  taille: string;
  quantite: number;
  prix_unitaire: number;
}

function rowToLigne(row: LigneDevisRow): LigneDevis {
  return { produitId: row.produit_id, motif: row.motif, reference: row.reference, taille: row.taille, quantite: row.quantite, prixUnitaire: row.prix_unitaire };
}

function rowToDevis(row: DevisRow, lignes: LigneDevis[]): Devis {
  return {
    id: row.id,
    numero: row.numero,
    date: row.date,
    clientNom: row.client_nom,
    clientTelephone: row.client_telephone,
    clientAdresse: row.client_adresse,
    modeReglement: row.mode_reglement,
    total: row.total,
    remise: row.remise,
    statut: row.statut,
    factureId: row.facture_id,
    utilisateurId: row.utilisateur_id,
    lignes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DevisRepository {
  constructor(private readonly db: Database.Database) {}

  /** Même idiome que DemandeRepository.nextNumero — numérotation locale, jamais liée à compteurs_facture (voir schema.sql). */
  nextNumero(): string {
    const year = new Date().getFullYear();
    const prefix = `DEV-${year}-`;
    const row = this.db.prepare("SELECT numero FROM devis WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1").get(`${prefix}%`) as
      | { numero: string }
      | undefined;
    const nextSeq = row ? parseInt(row.numero.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  creer(input: NouveauDevis): Devis {
    const id = randomUUID();
    const numero = this.nextNumero();
    const maintenant = new Date().toISOString();

    const executer = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO devis (id, numero, date, client_nom, client_telephone, client_adresse, mode_reglement, total, remise, statut, facture_id, utilisateur_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'brouillon', NULL, ?, ?, ?)`
        )
        .run(
          id,
          numero,
          maintenant,
          input.clientNom,
          input.clientTelephone ?? null,
          input.clientAdresse ?? null,
          input.modeReglement ?? null,
          input.total,
          input.remise ?? 0,
          input.utilisateurId ?? null,
          maintenant,
          maintenant
        );

      const insererLigne = this.db.prepare(
        "INSERT INTO lignes_devis (id, devis_id, produit_id, motif, reference, taille, quantite, prix_unitaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      for (const ligne of input.lignes) {
        insererLigne.run(randomUUID(), id, ligne.produitId, ligne.motif, ligne.reference, ligne.taille, ligne.quantite, ligne.prixUnitaire);
      }
    });
    executer();

    return this.findById(id)!;
  }

  findById(id: string): Devis | null {
    const row = this.db.prepare("SELECT * FROM devis WHERE id = ?").get(id) as DevisRow | undefined;
    if (!row) return null;
    const lignesRows = this.db.prepare("SELECT * FROM lignes_devis WHERE devis_id = ?").all(id) as LigneDevisRow[];
    return rowToDevis(row, lignesRows.map(rowToLigne));
  }

  /**
   * Les plus récents d'abord — jamais de pagination (volume d'un devis
   * par poste local, toujours modeste, même principe que le dashboard
   * avant sa propre pagination). Tri secondaire sur `rowid` (ordre
   * d'insertion réel) — même correction que DemandeRepository.listerSuivi :
   * deux devis créés à la même milliseconde auraient sinon un ordre
   * indéterminé (vérifié réellement, pas seulement supposé).
   */
  listerToutes(): Devis[] {
    const rows = this.db.prepare("SELECT * FROM devis ORDER BY created_at DESC, rowid DESC").all() as DevisRow[];
    return rows.map((row) => {
      const lignesRows = this.db.prepare("SELECT * FROM lignes_devis WHERE devis_id = ?").all(row.id) as LigneDevisRow[];
      return rowToDevis(row, lignesRows.map(rowToLigne));
    });
  }

  /** Un devis déjà converti ou annulé ne peut jamais l'être une seconde fois (vérifié par l'appelant, IPC — voir devis.ts). */
  marquerConvertie(id: string, factureId: string): void {
    this.db.prepare("UPDATE devis SET statut = 'convertie', facture_id = ?, updated_at = ? WHERE id = ?").run(factureId, new Date().toISOString(), id);
  }

  annuler(id: string): void {
    this.db.prepare("UPDATE devis SET statut = 'annulee', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }
}
