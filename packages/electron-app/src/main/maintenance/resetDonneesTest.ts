import type Database from "better-sqlite3-multiple-ciphers";

/**
 * Réinitialisation des données de test — correction "Tests réels Phase 2".
 *
 * ANALYSE PRÉALABLE (faite avant d'écrire une seule ligne de suppression,
 * comme demandé) : le graphe réel des clés étrangères, extrait
 * directement de schema.sql (jamais supposé) :
 *
 *   lignes_releve_interne          → releves_internes_approvisionnement
 *   releves_internes_approvisionnement → factures
 *   archive_factures_pdf           → factures
 *   lignes_facture                 → factures, produits
 *   mouvements                     → factures, emplacements (x3 colonnes), produits, utilisateurs
 *   factures                       → emplacements, utilisateurs (vendeur + annulée_par),
 *                                     factures (auto-référence : corrigee_par_facture_id)
 *   demandes                       → factures                (table Phase 4, vide en pratique)
 *   lignes_demande                 → demandes, produits       (table Phase 4, vide en pratique)
 *   notifications                  → demandes                (table Phase 4, vide en pratique)
 *   stocks                         → produits, emplacements
 *   images_produit                 → produits
 *   promotions                     → produits                (table Phase 4, vide en pratique)
 *
 * DÉCISION DÉLIBÉRÉE, jamais supposée silencieusement — à confirmer par
 * l'utilisateur avant tout lancement réel avec `--confirmer` :
 * - SUPPRIMÉES : toutes les données transactionnelles (factures, lignes,
 *   mouvements, stocks, relevés d'achat extérieur, archives PDF, tables
 *   de phases futures si jamais renseignées).
 * - CONSERVÉS, jamais touchés par ce script : `utilisateurs` (les
 *   comptes de connexion — les supprimer verrouillerait l'accès à
 *   l'application), `emplacements` (les points de vente — un
 *   utilisateur a pu les renommer/ajouter volontairement, ce n'est pas
 *   une "donnée de test"), `parametres_entreprise` et
 *   `telephones_entreprise` (l'identité de l'entreprise, configurée
 *   volontairement). La structure des tables, les migrations et le code
 *   ne sont bien sûr jamais concernés par ce script.
 * - `produits` (le catalogue) : PAS supprimé par défaut non plus, pour
 *   la même raison que les points de vente — un utilisateur peut avoir
 *   déjà saisi son vrai catalogue. Un drapeau séparé
 *   `--inclure-produits` permet de les inclure explicitement si
 *   l'utilisateur confirme qu'il s'agit bien de produits de test.
 *
 * SÉCURITÉ : sans `--confirmer`, ce script ne modifie JAMAIS la base —
 * il compte et affiche uniquement ce qui SERAIT supprimé (mode
 * simulation par défaut). C'est la façon dont "demander confirmation
 * avant toute suppression" est concrètement appliquée dans un contexte
 * de script en ligne de commande (aucune interaction possible en cours
 * d'exécution).
 */
export interface ResultatReset {
  simulation: boolean;
  compteurs: Record<string, number>;
}

export function executerResetDonneesTest(db: Database.Database, options: { confirmer: boolean; inclureProduits: boolean }): ResultatReset {
  const tables = [
    "lignes_releve_interne",
    "releves_internes_approvisionnement",
    "archive_factures_pdf",
    "lignes_facture",
    "mouvements",
    "lignes_demande",
    "notifications",
    "demandes",
    "factures",
    "stocks",
  ];
  if (options.inclureProduits) {
    tables.push("images_produit", "promotions", "produits");
  }

  const compteurs: Record<string, number> = {};
  for (const table of tables) {
    compteurs[table] = (db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
  }

  if (!options.confirmer) {
    return { simulation: true, compteurs };
  }

  const executer = db.transaction(() => {
    // L'auto-référence de `factures` (corrigee_par_facture_id) doit être
    // rompue avant la suppression, sinon une facture correctrice encore
    // référencée par une autre bloquerait sa propre suppression.
    db.exec("UPDATE factures SET corrigee_par_facture_id = NULL");
    for (const table of tables) {
      db.exec(`DELETE FROM ${table}`);
    }
  });
  executer();

  return { simulation: false, compteurs };
}
