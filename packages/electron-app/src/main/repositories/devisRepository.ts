import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import { devis as domainDevis } from "@maxi-equip/domain";

/**
 * Devis pro-forma (correction "ajouter les devis pro-forma", 2026-11-13)
 * — type volontairement local à ce fichier, jamais ajouté à
 * `shared-types` : un devis n'est jamais synchronisé entre postes ni
 * transmis au serveur (décision de portée, voir schema.sql) — c'est un
 * brouillon de travail propre à CE poste, contrairement à Facture/
 * Demande qui traversent une frontière process/réseau et ont donc
 * besoin d'un type partagé.
 *
 * Étendu le 2026-11-24 (point 6, modèle de proforma fourni) : espace /
 * application, surface, remise en % et unité par ligne, objet, notes et
 * remise globale sur le devis, modification d'un brouillon. Les totaux
 * sont TOUJOURS recalculés ici (`@maxi-equip/domain` devis), jamais repris
 * de l'appelant.
 */
export type DevisStatut = "brouillon" | "convertie" | "annulee";

export interface LigneDevis {
  produitId: string | null;
  motif: string;
  reference: string | null;
  taille: string;
  quantite: number;
  prixUnitaire: number;
  /** Libellé libre "Espace / application" (Salon, Cuisine - murs…). */
  espace?: string | null;
  /** Surface/besoin saisi (m²) — informatif, la quantité fait foi. */
  surfaceM2?: number | null;
  /** Remise de la ligne, en % (0 à 100). */
  remisePourcent?: number;
  /** Unité de vente du produit au moment du devis ("carton", "sac"…), `null` = carton (historique). */
  uniteVente?: string | null;
  /** Surface d'un carton (m²) au moment du devis — permet d'afficher le prix au m². */
  surfaceCartonM2?: number | null;
}

export interface Devis {
  id: string;
  numero: string;
  date: string;
  clientNom: string;
  clientTelephone: string | null;
  clientAdresse: string | null;
  modeReglement: string | null;
  /** Objet du devis, ex. "Fourniture de carrelage sols, murs et décors". */
  objet: string | null;
  /** Hypothèses de calcul, conditionnements, points à confirmer… (imprimé sur le PDF). */
  notes: string | null;
  /** Somme des montants bruts des lignes. */
  total: number;
  /** Remise TOTALE (remises des lignes + remiseGlobale) — reprise telle quelle à la conversion en vente. */
  remise: number;
  /** Remise supplémentaire sur l'ensemble (FCFA), incluse dans `remise`. */
  remiseGlobale: number;
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
  objet?: string | null;
  notes?: string | null;
  /** Ignoré : recalculé à partir des lignes. Conservé pour compatibilité d'appel. */
  total?: number;
  /** Ignoré : recalculé (remises des lignes + remiseGlobale). */
  remise?: number;
  remiseGlobale?: number;
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
  objet: string | null;
  notes: string | null;
  remise_globale: number | null;
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
  espace: string | null;
  surface_m2: number | null;
  remise_pourcent: number | null;
  unite_vente: string | null;
  surface_carton_m2: number | null;
}

function rowToLigne(row: LigneDevisRow): LigneDevis {
  return {
    produitId: row.produit_id,
    motif: row.motif,
    reference: row.reference,
    taille: row.taille,
    quantite: row.quantite,
    prixUnitaire: row.prix_unitaire,
    espace: row.espace ?? null,
    surfaceM2: row.surface_m2 ?? null,
    remisePourcent: row.remise_pourcent ?? 0,
    uniteVente: row.unite_vente ?? null,
    surfaceCartonM2: row.surface_carton_m2 ?? null,
  };
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
    objet: row.objet ?? null,
    notes: row.notes ?? null,
    total: row.total,
    remise: row.remise,
    remiseGlobale: row.remise_globale ?? 0,
    statut: row.statut,
    factureId: row.facture_id,
    utilisateurId: row.utilisateur_id,
    lignes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function calculerTotaux(input: NouveauDevis): domainDevis.TotauxDevis {
  return domainDevis.calculerTotauxDevis(
    input.lignes.map((l) => ({ quantite: l.quantite, prixUnitaire: l.prixUnitaire, remisePourcent: l.remisePourcent ?? 0 })),
    input.remiseGlobale ?? 0
  );
}

const SELECT_LIGNES = "SELECT * FROM lignes_devis WHERE devis_id = ? ORDER BY ordre, rowid";

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
    const totaux = calculerTotaux(input);

    const executer = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO devis (id, numero, date, client_nom, client_telephone, client_adresse, mode_reglement, objet, notes, remise_globale, total, remise, statut, facture_id, utilisateur_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brouillon', NULL, ?, ?, ?)`
        )
        .run(
          id,
          numero,
          maintenant,
          input.clientNom,
          input.clientTelephone ?? null,
          input.clientAdresse ?? null,
          input.modeReglement ?? null,
          input.objet ?? null,
          input.notes ?? null,
          totaux.remiseGlobale,
          totaux.brut,
          totaux.remiseTotale,
          input.utilisateurId ?? null,
          maintenant,
          maintenant
        );
      this.insererLignes(id, input.lignes);
    });
    executer();

    return this.findById(id)!;
  }

  /**
   * Modification d'un devis ENCORE en brouillon (vérifié par l'appelant,
   * voir ipc/devis.ts) : en-tête mis à jour, lignes entièrement
   * remplacées (un devis n'a aucun lien de stock ni de synchronisation,
   * rien d'autre ne référence ses lignes). Numéro et date inchangés.
   */
  modifier(id: string, input: NouveauDevis): Devis {
    const totaux = calculerTotaux(input);
    const executer = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE devis SET client_nom = ?, client_telephone = ?, client_adresse = ?, mode_reglement = ?, objet = ?, notes = ?,
             remise_globale = ?, total = ?, remise = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.clientNom,
          input.clientTelephone ?? null,
          input.clientAdresse ?? null,
          input.modeReglement ?? null,
          input.objet ?? null,
          input.notes ?? null,
          totaux.remiseGlobale,
          totaux.brut,
          totaux.remiseTotale,
          new Date().toISOString(),
          id
        );
      this.db.prepare("DELETE FROM lignes_devis WHERE devis_id = ?").run(id);
      this.insererLignes(id, input.lignes);
    });
    executer();
    return this.findById(id)!;
  }

  private insererLignes(devisId: string, lignes: LigneDevis[]): void {
    const insererLigne = this.db.prepare(
      `INSERT INTO lignes_devis (id, devis_id, produit_id, motif, reference, taille, quantite, prix_unitaire, espace, surface_m2, remise_pourcent, unite_vente, surface_carton_m2, ordre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    lignes.forEach((ligne, index) => {
      insererLigne.run(
        randomUUID(),
        devisId,
        ligne.produitId,
        ligne.motif,
        ligne.reference,
        ligne.taille,
        ligne.quantite,
        ligne.prixUnitaire,
        ligne.espace?.trim() || null,
        ligne.surfaceM2 ?? null,
        Math.min(100, Math.max(0, ligne.remisePourcent ?? 0)),
        ligne.uniteVente ?? null,
        ligne.surfaceCartonM2 ?? null,
        index
      );
    });
  }

  findById(id: string): Devis | null {
    const row = this.db.prepare("SELECT * FROM devis WHERE id = ?").get(id) as DevisRow | undefined;
    if (!row) return null;
    const lignesRows = this.db.prepare(SELECT_LIGNES).all(id) as LigneDevisRow[];
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
      const lignesRows = this.db.prepare(SELECT_LIGNES).all(row.id) as LigneDevisRow[];
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
