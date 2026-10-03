import { describe, it, expect } from "vitest";
import type { auth } from "@maxi-equip/domain";
import { SessionManager } from "./sessionManager.js";
import { checkAdminGuard } from "./checkAdminGuard.js";

/**
 * Tests de régression (audit "check up complet") — cette garde protège
 * désormais aussi `ipc/backup.ts` et `ipc/backupRestore.ts`, qui
 * n'avaient auparavant AUCUNE vérification de session/rôle côté Main
 * (seul l'écran Paramètres masquait ces actions côté Renderer, jamais
 * une vraie barrière de sécurité).
 */

function creerSession(role: "administrateur" | "gerant"): auth.SessionLocale {
  return {
    userId: "u1",
    nom: "Test",
    identifiant: "test",
    role,
    authentifieLe: new Date().toISOString(),
  };
}

describe("checkAdminGuard", () => {
  it("refuse quand aucune session n'est active", () => {
    const sessionManager = new SessionManager();
    expect(checkAdminGuard(sessionManager)).toEqual({ ok: false, message: "Non authentifié." });
  });

  it("refuse un utilisateur Gérant", () => {
    const sessionManager = new SessionManager();
    sessionManager.set(creerSession("gerant"));
    expect(checkAdminGuard(sessionManager)).toEqual({ ok: false, message: "Action réservée aux administrateurs." });
  });

  it("autorise un utilisateur Administrateur", () => {
    const sessionManager = new SessionManager();
    sessionManager.set(creerSession("administrateur"));
    expect(checkAdminGuard(sessionManager)).toEqual({ ok: true });
  });

  it("refuse à nouveau après clear() (déconnexion)", () => {
    const sessionManager = new SessionManager();
    sessionManager.set(creerSession("administrateur"));
    sessionManager.clear();
    expect(checkAdminGuard(sessionManager)).toEqual({ ok: false, message: "Non authentifié." });
  });
});
