import { defaultTokens } from "@maxi-equip/design-system";

/**
 * Libellés utilisateur des types de mouvement — SOURCE UNIQUE, partagée
 * entre tous les écrans qui affichent un mouvement de stock (Historique,
 * Dashboard, et tout futur écran). "sortie" s'affiche "Vente" (correction
 * Phase 2 : "une sortie de stock est, du point de vue utilisateur, une
 * VENTE"), la valeur technique en base reste inchangée.
 *
 * Cette centralisation existe précisément pour éviter le type d'écart
 * constaté lors de l'audit Administrateur/Gérant : le tableau de bord
 * Gérant affichait encore "Sortie" dans son flux d'activité récente,
 * pendant que l'Historique avait déjà été corrigé pour dire "Vente" —
 * deux copies du même libellé avaient divergé.
 */
export const MOUVEMENT_LABELS: Record<string, string> = { entree: "Entrée", sortie: "Vente", transfert: "Transfert" };

export const MOUVEMENT_COLORS: Record<string, string> = {
  entree: defaultTokens.colors.success,
  sortie: defaultTokens.colors.danger,
  transfert: defaultTokens.colors.info,
};
