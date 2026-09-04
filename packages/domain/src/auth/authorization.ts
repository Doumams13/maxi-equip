import type { Role } from "@maxi-equip/shared-types";

/**
 * Règles d'autorisation — Synthèse §9, point 13 du prompt Phase 1.
 *
 * SOURCE UNIQUE de la matrice de droits Administrateur/Gérant. Ni
 * l'interface, ni l'API ne doivent redéfinir cette logique ailleurs —
 * elles appellent ces fonctions (§13 : "ne duplique pas la logique
 * d'autorisation à plusieurs endroits").
 *
 * Matrice de droits (Synthèse §9) :
 *
 * | Action                                   | Administrateur | Gérant |
 * |-------------------------------------------|:--------------:|:------:|
 * | Ventes, entrées, sorties, transferts      |       ✅        |   ✅   |
 * | Consultation stock/factures/historique    |       ✅        |   ✅   |
 * | Traitement des demandes du site           |       ✅        |   ✅   |
 * | Tableau de bord opérationnel              |       ✅        |   ✅   |
 * | Consultation des promotions actives       |       ✅        |   ✅   |
 * | Création/modification des promotions      |       ✅        |   ❌   |
 * | Paramètres entreprise, logo               |       ✅        |   ❌   |
 * | Gestion des utilisateurs (CRUD)           |       ✅        |   ❌   |
 */

const RESERVE_ADMINISTRATEUR: ReadonlySet<Role> = new Set(["administrateur"]);
const OUVERT_AUX_DEUX_ROLES: ReadonlySet<Role> = new Set(["administrateur", "gerant"]);

export function canManageUsers(role: Role): boolean {
  return RESERVE_ADMINISTRATEUR.has(role);
}

export function canManagePromotions(role: Role): boolean {
  return RESERVE_ADMINISTRATEUR.has(role);
}

export function canEditCompanySettings(role: Role): boolean {
  return RESERVE_ADMINISTRATEUR.has(role);
}

export function canViewActivePromotions(role: Role): boolean {
  return OUVERT_AUX_DEUX_ROLES.has(role);
}

export function canOperateSales(role: Role): boolean {
  return OUVERT_AUX_DEUX_ROLES.has(role);
}

export function canOperateStock(role: Role): boolean {
  return OUVERT_AUX_DEUX_ROLES.has(role);
}

export function canAccessHistory(role: Role): boolean {
  return OUVERT_AUX_DEUX_ROLES.has(role);
}

export function canHandleSiteRequests(role: Role): boolean {
  return OUVERT_AUX_DEUX_ROLES.has(role);
}

export function canAccessOperationalDashboard(role: Role): boolean {
  return OUVERT_AUX_DEUX_ROLES.has(role);
}

/** Toutes les permissions disponibles pour un rôle donné — utile pour l'exposer en une fois au Renderer via IPC. */
export interface PermissionSet {
  canManageUsers: boolean;
  canManagePromotions: boolean;
  canEditCompanySettings: boolean;
  canViewActivePromotions: boolean;
  canOperateSales: boolean;
  canOperateStock: boolean;
  canAccessHistory: boolean;
  canHandleSiteRequests: boolean;
  canAccessOperationalDashboard: boolean;
}

export function getPermissionSet(role: Role): PermissionSet {
  return {
    canManageUsers: canManageUsers(role),
    canManagePromotions: canManagePromotions(role),
    canEditCompanySettings: canEditCompanySettings(role),
    canViewActivePromotions: canViewActivePromotions(role),
    canOperateSales: canOperateSales(role),
    canOperateStock: canOperateStock(role),
    canAccessHistory: canAccessHistory(role),
    canHandleSiteRequests: canHandleSiteRequests(role),
    canAccessOperationalDashboard: canAccessOperationalDashboard(role),
  };
}
