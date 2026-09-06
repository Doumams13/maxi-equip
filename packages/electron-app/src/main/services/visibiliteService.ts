import type { auth } from "@maxi-equip/domain";
import type { MouvementEnrichi } from "../repositories/mouvementRepository.js";
import type { Facture } from "@maxi-equip/shared-types";

type FactureAvecVendeur = Facture & { vendeurNom: string | null; vendeurRole: string | null };

/**
 * Logique centralisée de visibilité de l'auteur d'une opération —
 * Consolidation Administrateur/Gérant. Utilisée partout où une activité
 * (mouvement) est renvoyée au Renderer : Historique, Dashboard.
 *
 * Règle (§2-§5 de la correction) :
 * - Administrateur : voit toujours l'auteur de toute opération ;
 * - Gérant : voit TOUTES les opérations (vision globale de l'activité
 *   opérationnelle), mais jamais l'identité d'un autre utilisateur — sauf
 *   pour ses propres opérations, où l'auteur reste visible (le Renderer
 *   peut alors afficher "Vous" plutôt que masquer une information qui le
 *   concerne lui-même).
 *
 * Décision serveur, jamais côté Renderer (§23 : centraliser la logique ;
 * principe déjà établi du projet : "le Renderer ne doit pas être
 * considéré comme une source de confiance").
 */
export function anonymiserActivite(mouvements: MouvementEnrichi[], session: auth.SessionLocale): MouvementEnrichi[] {
  if (session.role === "administrateur") return mouvements;

  return mouvements.map((m) => {
    const estSonPropreOperation = m.utilisateurId === session.userId;
    if (estSonPropreOperation) return m;
    return { ...m, utilisateurId: null, utilisateurNom: null, utilisateurRole: null };
  });
}

/**
 * Même principe que anonymiserActivite, appliqué aux factures (§11 de la
 * consolidation) : le Gérant voit toutes les factures (client, produits,
 * montants, date), mais jamais l'identité du vendeur d'une facture qui
 * n'est pas la sienne.
 */
export function anonymiserFactures(factures: FactureAvecVendeur[], session: auth.SessionLocale): FactureAvecVendeur[] {
  if (session.role === "administrateur") return factures;

  return factures.map((f) => {
    const estSaPropreVente = f.vendeurUtilisateurId === session.userId;
    if (estSaPropreVente) return f;
    return { ...f, vendeurNom: null, vendeurRole: null };
  });
}
