import type Database from "better-sqlite3-multiple-ciphers";
import type { ConfigurationUnitesSousCategorie, UniteVente } from "@maxi-equip/shared-types";
import { catalogue as domainCatalogue } from "@maxi-equip/domain";

/**
 * Configuration des unités de vente autorisées par sous-catégorie —
 * fondations quincaillerie (Phase 3 bis). Entité purement
 * administrative (comme SousCategorieChampRepository), jamais de
 * donnée transactionnelle. Voir shared-types/categorie.ts
 * (ConfigurationUnitesSousCategorie) et domain/catalogue (règles de
 * compatibilité — jamais réimplémentées ici).
 */
export class SousCategorieUniteRepository {
  constructor(private readonly db: Database.Database) {}

  obtenirConfiguration(sousCategorieId: string): ConfigurationUnitesSousCategorie {
    const row = this.db.prepare("SELECT unites_configurees FROM sous_categories WHERE id = ?").get(sousCategorieId) as
      | { unites_configurees: number }
      | undefined;
    const configuree = (row?.unites_configurees ?? 0) === 1;
    const rows = this.db.prepare("SELECT unite_vente FROM sous_categorie_unites WHERE sous_categorie_id = ? ORDER BY unite_vente").all(sousCategorieId) as {
      unite_vente: UniteVente;
    }[];
    return { configuree, unites: rows.map((r) => r.unite_vente) };
  }

  /** Toutes les configurations, groupées par sous-catégorie — évite un aller-retour IPC par sous-catégorie côté Renderer (même principe que SousCategorieChampRepository.listGroupesParSousCategorie). */
  listGroupesParSousCategorie(): Record<string, ConfigurationUnitesSousCategorie> {
    const sousCategories = this.db.prepare("SELECT id, unites_configurees FROM sous_categories").all() as { id: string; unites_configurees: number }[];
    const unitesRows = this.db.prepare("SELECT sous_categorie_id, unite_vente FROM sous_categorie_unites ORDER BY unite_vente").all() as {
      sous_categorie_id: string;
      unite_vente: UniteVente;
    }[];
    const unitesParSousCategorie: Record<string, UniteVente[]> = {};
    for (const row of unitesRows) {
      (unitesParSousCategorie[row.sous_categorie_id] ??= []).push(row.unite_vente);
    }
    const resultat: Record<string, ConfigurationUnitesSousCategorie> = {};
    for (const sc of sousCategories) {
      resultat[sc.id] = { configuree: sc.unites_configurees === 1, unites: unitesParSousCategorie[sc.id] ?? [] };
    }
    return resultat;
  }

  /**
   * Configure EXPLICITEMENT cette sous-catégorie — pose
   * `unites_configurees = 1` ET remplace les lignes, dans la même
   * transaction. Refuse une liste vide (voir domain/catalogue,
   * `validerConfigurationUnites`) : une sous-catégorie configurée
   * autorise toujours au moins une unité, jamais persistée autrement.
   */
  definir(sousCategorieId: string, unites: UniteVente[]): void {
    domainCatalogue.validerConfigurationUnites(unites);
    const now = new Date().toISOString();
    const executer = this.db.transaction(() => {
      this.db.prepare("DELETE FROM sous_categorie_unites WHERE sous_categorie_id = ?").run(sousCategorieId);
      const insert = this.db.prepare("INSERT INTO sous_categorie_unites (sous_categorie_id, unite_vente) VALUES (?, ?)");
      for (const unite of unites) insert.run(sousCategorieId, unite);
      this.db.prepare("UPDATE sous_categories SET unites_configurees = 1, updated_at = ? WHERE id = ?").run(now, sousCategorieId);
    });
    executer();
  }

  /**
   * Revient à "non configurée" — état distinct de `definir(id, [])`
   * (qui est de toute façon refusé) : vide les lignes ET repasse
   * `unites_configurees` à 0, pour que les 6 unités redeviennent
   * proposées (voir domain/catalogue, unitesEffectivesPourSousCategorie).
   */
  reinitialiser(sousCategorieId: string): void {
    const now = new Date().toISOString();
    const executer = this.db.transaction(() => {
      this.db.prepare("DELETE FROM sous_categorie_unites WHERE sous_categorie_id = ?").run(sousCategorieId);
      this.db.prepare("UPDATE sous_categories SET unites_configurees = 0, updated_at = ? WHERE id = ?").run(now, sousCategorieId);
    });
    executer();
  }
}
