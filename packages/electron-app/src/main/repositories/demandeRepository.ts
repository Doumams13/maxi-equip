import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Demande, DemandeStatut, LigneDemande } from "@maxi-equip/shared-types";

/**
 * Phase 4.1 — dépôt des demandes du site vitrine. Les tables
 * `demandes`/`lignes_demande` existaient déjà dans le schéma (Phase 0),
 * jamais utilisées jusqu'ici — ce fichier est la première implémentation
 * réelle.
 */

interface DemandeRow {
  id: string;
  numero: string;
  statut: DemandeStatut;
  client_nom: string;
  client_telephone: string;
  client_adresse: string;
  client_email: string | null;
  commentaire: string | null;
  facture_id: string | null;
  refus_motif: string | null;
  created_at: string;
  updated_at: string;
}

interface LigneDemandeRow {
  id: string;
  demande_id: string;
  produit_id: string;
  motif: string;
  taille: string;
  quantite: number;
  prix_indicatif: number;
}

function rowToLigne(row: LigneDemandeRow): LigneDemande {
  return { produitId: row.produit_id, motif: row.motif, taille: row.taille, quantite: row.quantite, prixIndicatif: row.prix_indicatif };
}

function rowToDemande(row: DemandeRow, lignes: LigneDemande[]): Demande {
  return {
    id: row.id,
    numero: row.numero,
    statut: row.statut,
    clientNom: row.client_nom,
    clientTelephone: row.client_telephone,
    clientAdresse: row.client_adresse,
    clientEmail: row.client_email,
    commentaire: row.commentaire,
    lignes,
    factureId: row.facture_id,
    refusMotif: row.refus_motif,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NouvelleLigneDemande {
  produitId: string;
  motif: string;
  taille: string;
  quantite: number;
  prixIndicatif: number;
}

export interface NouvelleDemande {
  clientNom: string;
  clientTelephone: string;
  clientAdresse: string;
  clientEmail?: string | null;
  commentaire?: string | null;
  lignes: NouvelleLigneDemande[];
  /** Renseigné uniquement pour une demande reçue via synchronisation (Partie 17) — jamais pour une demande de test créée directement. */
  sourceEntityId?: string | null;
}

export class DemandeRepository {
  constructor(private readonly db: Database.Database) {}

  nextNumero(): string {
    const year = new Date().getFullYear();
    const prefix = `DEM-${year}-`;
    const row = this.db.prepare("SELECT numero FROM demandes WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1").get(`${prefix}%`) as
      | { numero: string }
      | undefined;
    const nextSeq = row ? parseInt(row.numero.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  /** Partie 17 : garantit qu'un identifiant source déjà traité ne crée jamais une seconde demande locale, même en cas de nouvelle synchronisation recouvrant la même opération. */
  trouverParSourceEntityId(sourceEntityId: string): Demande | null {
    const row = this.db.prepare("SELECT * FROM demandes WHERE source_entity_id = ?").get(sourceEntityId) as DemandeRow | undefined;
    if (!row) return null;
    const lignesRows = this.db.prepare("SELECT * FROM lignes_demande WHERE demande_id = ?").all(row.id) as LigneDemandeRow[];
    return rowToDemande(row, lignesRows.map(rowToLigne));
  }

  creer(input: NouvelleDemande): Demande {
    const id = randomUUID();
    const numero = this.nextNumero();
    const maintenant = new Date().toISOString();

    const executer = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO demandes (id, numero, statut, client_nom, client_telephone, client_adresse, client_email, commentaire, facture_id, refus_motif, source_entity_id, created_at, updated_at)
           VALUES (?, ?, 'nouvelle', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`
        )
        .run(
          id,
          numero,
          input.clientNom,
          input.clientTelephone,
          input.clientAdresse,
          input.clientEmail ?? null,
          input.commentaire ?? null,
          input.sourceEntityId ?? null,
          maintenant,
          maintenant
        );

      const insererLigne = this.db.prepare(
        "INSERT INTO lignes_demande (id, demande_id, produit_id, motif, taille, quantite, prix_indicatif) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const ligne of input.lignes) {
        insererLigne.run(randomUUID(), id, ligne.produitId, ligne.motif, ligne.taille, ligne.quantite, ligne.prixIndicatif);
      }
    });
    executer();

    return this.findById(id)!;
  }

  findById(id: string): Demande | null {
    const row = this.db.prepare("SELECT * FROM demandes WHERE id = ?").get(id) as DemandeRow | undefined;
    if (!row) return null;
    const lignesRows = this.db.prepare("SELECT * FROM lignes_demande WHERE demande_id = ?").all(id) as LigneDemandeRow[];
    return rowToDemande(row, lignesRows.map(rowToLigne));
  }

  listerToutes(): Demande[] {
    const rows = this.db.prepare("SELECT * FROM demandes ORDER BY created_at DESC").all() as DemandeRow[];
    return rows.map((row) => {
      const lignesRows = this.db.prepare("SELECT * FROM lignes_demande WHERE demande_id = ?").all(row.id) as LigneDemandeRow[];
      return rowToDemande(row, lignesRows.map(rowToLigne));
    });
  }

  changerStatut(id: string, statut: DemandeStatut): void {
    this.db.prepare("UPDATE demandes SET statut = ?, updated_at = ? WHERE id = ?").run(statut, new Date().toISOString(), id);
  }

  refuser(id: string, motif: string): void {
    this.db.prepare("UPDATE demandes SET statut = 'refusee', refus_motif = ?, updated_at = ? WHERE id = ?").run(motif, new Date().toISOString(), id);
  }

  marquerConfirmee(id: string, factureId: string): void {
    this.db.prepare("UPDATE demandes SET statut = 'confirmee', facture_id = ?, updated_at = ? WHERE id = ?").run(factureId, new Date().toISOString(), id);
  }

  /**
   * Correction "Workflow réel des demandes", Partie 5/6/7 : historique
   * de suivi. Écrit un commentaire (facultatif — Partie 8) à chaque
   * changement de statut. Jamais utilisé pour confirmer/refuser, qui
   * gardent leur propre trace explicite (`refus_motif`, `facture_id`).
   */
  ajouterSuivi(demandeId: string, statut: DemandeStatut, commentaire: string | null): void {
    this.db
      .prepare("INSERT INTO suivi_demande (id, demande_id, statut, commentaire, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), demandeId, statut, commentaire, new Date().toISOString());
  }

  /** Plus récent en premier (Partie 7). Tri secondaire sur `rowid` (ordre d'insertion réel) car deux entrées créées à la même milliseconde auraient sinon un ordre indéterminé — vérifié réellement : des tests rapides successifs produisent bien des timestamps identiques. */
  listerSuivi(demandeId: string): { statut: DemandeStatut; commentaire: string | null; createdAt: string }[] {
    const rows = this.db
      .prepare("SELECT statut, commentaire, created_at FROM suivi_demande WHERE demande_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(demandeId) as {
      statut: DemandeStatut;
      commentaire: string | null;
      created_at: string;
    }[];
    return rows.map((r) => ({ statut: r.statut, commentaire: r.commentaire, createdAt: r.created_at }));
  }

  /**
   * Partie 18/19 : uniquement les demandes réellement actives — jamais
   * un compteur purement visuel. "contactee" est incluse par sécurité
   * (donnée historique éventuelle avant la migration de cette
   * correction), bien que le workflow ne la produise plus.
   */
  compterActives(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM demandes WHERE statut IN ('nouvelle', 'a_contacter', 'en_cours', 'contactee')")
      .get() as { n: number };
    return row.n;
  }

  /**
   * Purge (Partie 13/14) — véritable suppression définitive, uniquement
   * les demandes NON confirmées en facture, âgées de plus de `seuilMs`.
   * Retourne les identifiants réellement supprimés.
   */
  purgerDemandesNonConfirmeesAvant(seuilMs: number): string[] {
    const limite = new Date(Date.now() - seuilMs).toISOString();
    const aSupprimer = this.db.prepare("SELECT id FROM demandes WHERE statut != 'confirmee' AND created_at < ?").all(limite) as { id: string }[];

    if (aSupprimer.length === 0) return [];

    const executer = this.db.transaction(() => {
      for (const { id } of aSupprimer) {
        this.db.prepare("DELETE FROM notifications WHERE demande_id = ?").run(id);
        this.db.prepare("DELETE FROM suivi_demande WHERE demande_id = ?").run(id);
        this.db.prepare("DELETE FROM lignes_demande WHERE demande_id = ?").run(id);
        this.db.prepare("DELETE FROM demandes WHERE id = ?").run(id);
      }
    });
    executer();

    return aSupprimer.map((r) => r.id);
  }
}
