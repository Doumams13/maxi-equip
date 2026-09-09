import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Emplacement } from "@maxi-equip/shared-types";

interface EmplacementRow {
  id: string;
  nom: string;
  type: string;
  ville: string;
  est_point_de_vente: number;
  actif: number;
}

function rowToEmplacement(row: EmplacementRow): Emplacement {
  return {
    id: row.id,
    nom: row.nom,
    type: row.type as Emplacement["type"],
    ville: row.ville,
    estPointDeVente: row.est_point_de_vente === 1,
    actif: row.actif === 1,
    createdAt: "",
    updatedAt: "",
  };
}

export class EmplacementRepository {
  constructor(private readonly db: Database.Database) {}

  /** Tous les emplacements, actifs ET archivés — les écrans opérationnels (Stock/Ventes/Transferts) filtrent eux-mêmes sur `actif`, jamais ici (l'Historique et les documents doivent toujours pouvoir résoudre le nom d'un emplacement archivé). */
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
        `INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, input.nom, input.type, input.ville, input.estPointDeVente ? 1 : 0, now, now);
    return id;
  }

  /**
   * Crée un NOUVEAU point de vente/dépôt — correction "Points de vente
   * dynamiques" §2. Toujours de type "depot" (jamais "shop" : SHOP reste
   * une entité unique et fixe, la décision métier "SHOP n'a pas de
   * stock" ne change pas). Actif par défaut, stock initial à 0 pour tous
   * les produits (implicite : aucune ligne dans `stocks` tant qu'aucune
   * entrée n'a été enregistrée — la quantité y est déjà lue comme 0 par
   * défaut partout dans l'application, jamais besoin de créer des lignes
   * de stock vides ici).
   */
  creerDepot(nom: string, ville: string): string {
    const valeur = nom.trim();
    if (!valeur) throw new Error("Le nom du point de vente ne peut pas être vide.");
    return this.create({ nom: valeur, type: "depot", ville: ville.trim() || "Libreville", estPointDeVente: false });
  }

  /**
   * Renomme un emplacement existant — le changement de nom ne crée
   * jamais un nouvel enregistrement, toutes les données déjà liées
   * (ventes, entrées, transferts, stock, historique) restent associées
   * au même `id`, donc automatiquement à jour partout (§4).
   */
  renommer(id: string, nouveauNom: string): void {
    const valeur = nouveauNom.trim();
    if (!valeur) throw new Error("Le nom de l'emplacement ne peut pas être vide.");
    this.db.prepare("UPDATE emplacements SET nom = ?, updated_at = ? WHERE id = ?").run(valeur, new Date().toISOString(), id);
  }

  /**
   * Archive (jamais une suppression physique, §5/§9) — le point de vente
   * n'est plus proposé pour de nouvelles opérations, mais tout son
   * historique reste intact et consultable. La vérification "possède
   * encore du stock" est une décision métier, prise dans le service
   * appelant (jamais ici — ce dépôt reste une pure couche de persistance).
   */
  archiver(id: string): void {
    this.db.prepare("UPDATE emplacements SET actif = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  /** Réactive un emplacement archivé — redevient immédiatement disponible pour de nouvelles opérations (§6). */
  reactiver(id: string): void {
    this.db.prepare("UPDATE emplacements SET actif = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }
}

/**
 * Amorce les trois emplacements de la V1 (Synthèse §2/§9) s'ils n'existent
 * pas encore : SHOP (point de vente) et les deux dépôts, Akébé et Akanda.
 * Jamais recréés si des emplacements existent déjà (§14 — ne détruit
 * aucune donnée existante). Deviennent simplement les deux premiers
 * enregistrements du système dynamique de points de vente (correction
 * "Points de vente dynamiques" §11 : "les deux points de vente actuels
 * doivent simplement devenir les deux premiers enregistrements").
 */
export function bootstrapDefaultEmplacements(repository: EmplacementRepository): void {
  if (repository.count() > 0) return;

  repository.create({ nom: "SHOP", type: "shop", ville: "Libreville", estPointDeVente: true });
  repository.create({ nom: "Akébé", type: "depot", ville: "Libreville", estPointDeVente: false });
  repository.create({ nom: "Akanda", type: "depot", ville: "Libreville", estPointDeVente: false });
}
