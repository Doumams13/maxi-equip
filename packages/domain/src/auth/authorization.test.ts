import { describe, expect, it } from "vitest";
import {
  canManageUsers,
  canManagePromotions,
  canEditCompanySettings,
  canOperateSales,
  canOperateStock,
  canAccessHistory,
  canViewActivePromotions,
  getPermissionSet,
} from "./authorization.js";

describe("Autorisation — Administrateur", () => {
  it("peut gérer les utilisateurs", () => expect(canManageUsers("administrateur")).toBe(true));
  it("peut gérer les promotions", () => expect(canManagePromotions("administrateur")).toBe(true));
  it("peut modifier les paramètres de l'entreprise", () => expect(canEditCompanySettings("administrateur")).toBe(true));
  it("peut effectuer des ventes", () => expect(canOperateSales("administrateur")).toBe(true));
  it("peut opérer le stock", () => expect(canOperateStock("administrateur")).toBe(true));
  it("peut consulter l'historique", () => expect(canAccessHistory("administrateur")).toBe(true));
});

describe("Autorisation — Gérant", () => {
  it("NE PEUT PAS gérer les utilisateurs", () => expect(canManageUsers("gerant")).toBe(false));
  it("NE PEUT PAS gérer les promotions", () => expect(canManagePromotions("gerant")).toBe(false));
  it("NE PEUT PAS modifier les paramètres de l'entreprise", () => expect(canEditCompanySettings("gerant")).toBe(false));
  it("peut effectuer des ventes", () => expect(canOperateSales("gerant")).toBe(true));
  it("peut opérer le stock", () => expect(canOperateStock("gerant")).toBe(true));
  it("peut consulter l'historique", () => expect(canAccessHistory("gerant")).toBe(true));
  it("peut consulter les promotions actives (lecture seule)", () => expect(canViewActivePromotions("gerant")).toBe(true));
});

describe("getPermissionSet — vue consolidée par rôle", () => {
  it("l'administrateur a toutes les permissions à true", () => {
    const permissions = getPermissionSet("administrateur");
    expect(Object.values(permissions).every(Boolean)).toBe(true);
  });

  it("le gérant n'a pas les trois permissions réservées à l'administrateur", () => {
    const permissions = getPermissionSet("gerant");
    expect(permissions.canManageUsers).toBe(false);
    expect(permissions.canManagePromotions).toBe(false);
    expect(permissions.canEditCompanySettings).toBe(false);
  });

  it("le gérant a bien les opérations quotidiennes", () => {
    const permissions = getPermissionSet("gerant");
    expect(permissions.canOperateSales).toBe(true);
    expect(permissions.canOperateStock).toBe(true);
    expect(permissions.canAccessHistory).toBe(true);
    expect(permissions.canHandleSiteRequests).toBe(true);
    expect(permissions.canAccessOperationalDashboard).toBe(true);
    expect(permissions.canViewActivePromotions).toBe(true);
  });
});
