import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Emplacement } from "@maxi-equip/shared-types";

interface EmplacementRow {
  id: string;
  nom: string;
  type: string;
  ville: string;
  est_point_de_vente: number;
}

function rowToEmplacement(row: EmplacementRow): Emplacement {
  return {
    id: row.id,
    nom: row.nom,
    type: row.type as Emplacement["type"],
    ville: row.ville,
    estPointDeVente: row.est_point_de_vente === 1,
    createdAt: "",
    updatedAt: "",
  };
}

export class EmplacementRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Emplacement[] {
    const rows = this.db.prepare("SELECT * FROM emplacements ORDER BY est_point_de_vente DESC, nom").all() as EmplacementRow[];
    return rows.map(rowToEmplacement);
  }

  findById(id: string): Emplacement | null {
    const row = this.db.prepare("SELECT * FROM emplacements WHERE id = ?").get(id) as EmplacementRow | undefined;
    return row ? rowToEmplacement(row) : null;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) as n FROM emplacements").get() as { n: number }).n;
  }

  create(input: { nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.nom, input.type, input.ville, input.estPointDeVente ? 1 : 0, now, now);
    return id;
  }

  /**
   * Renomme un emplacement existant — correction "Paramètres" (points de
   * vente / emplacements) : uniquement renommer les deux dépôts déjà
   * existants (Akébé, Akanda), jamais en créer ou en supprimer (limite
   * explicite du prompt). Toutes les zones de l'application lisent déjà
   * `emplacement.nom` directement depuis cette table — aucune autre
   * modification n'est nécessaire pour que le nouveau nom apparaisse
   * partout (Stock, Ventes, Transferts, Historique, Tableau de bord,
   * documents).
   */
  renommer(id: string, nouveauNom: string): void {
    const valeur = nouveauNom.trim();
    if (!valeur) throw new Error("Le nom de l'emplacement ne peut pas être vide.");
    this.db.prepare("UPDATE emplacements SET nom = ?, updated_at = ? WHERE id = ?").run(valeur, new Date().toISOString(), id);
  }
}

/**
 * Amorce les trois emplacements de la V1 (Synthèse §2/§9) s'ils n'existent
 * pas encore : SHOP (point de vente) et les deux dépôts, Akébé et Akanda.
 * Jamais recréés si des emplacements existent déjà (§14 — ne détruit
 * aucune donnée existante).
 */
export function bootstrapDefaultEmplacements(repository: EmplacementRepository): void {
  if (repository.count() > 0) return;

  repository.create({ nom: "SHOP", type: "shop", ville: "Libreville", estPointDeVente: true });
  repository.create({ nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false });
  repository.create({ nom: "Akanda", type: "depot", ville: "Libreville", estPointDeVente: false });
}
