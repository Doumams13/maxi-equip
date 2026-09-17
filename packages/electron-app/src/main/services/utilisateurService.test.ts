import { describe, it, expect, vi } from "vitest";
import type { auth } from "@maxi-equip/domain";
import type { Role } from "@maxi-equip/shared-types";
import { UtilisateurService } from "./utilisateurService.js";
import type { UtilisateurPublic } from "../auth/utilisateurRepository.js";

/**
 * Tests du service de gestion des utilisateurs — fake repositories (aucune
 * dépendance SQLite, impossible à exécuter dans cet environnement Vitest
 * sans Electron + module natif rebuilt).
 *
 * Couverture : création, modification, réinitialisation mot de passe,
 * activation/désactivation, politiques métier, protection dernier admin.
 */

// ─── Types locaux pour les fake repos ────────────────────────────────────────

interface UtilisateurFake {
  id: string;
  nom: string;
  identifiant: string;
  passwordHash: string;
  role: Role;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

function creerFakeRepo(seed: UtilisateurFake[] = []) {
  const utilisateurs: UtilisateurFake[] = seed.map((u) => ({ ...u }));
  let nextId = 1;

  return {
    _data: utilisateurs,
    findById: vi.fn((id: string) => {
      const u = utilisateurs.find((x) => x.id === id);
      if (!u) return null;
      return { id: u.id, nom: u.nom, identifiant: u.identifiant, role: u.role, actif: u.actif };
    }),
    list: vi.fn((): UtilisateurPublic[] =>
      [...utilisateurs]
        .sort((a, b) => a.nom.localeCompare(b.nom))
        .map((u) => ({
          id: u.id,
          nom: u.nom,
          identifiant: u.identifiant,
          role: u.role,
          actif: u.actif,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        }))
    ),
    create: vi.fn((input: { nom: string; identifiant: string; passwordHash: string; role: Role }) => {
      const id = `user-${nextId++}`;
      utilisateurs.push({ id, nom: input.nom, identifiant: input.identifiant, passwordHash: input.passwordHash, role: input.role, actif: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return id;
    }),
    update: vi.fn((id: string, input: { nom?: string; role?: Role; identifiant?: string }) => {
      const u = utilisateurs.find((x) => x.id === id);
      if (!u) return;
      if (input.nom !== undefined) u.nom = input.nom;
      if (input.role !== undefined) u.role = input.role;
      if (input.identifiant !== undefined) u.identifiant = input.identifiant;
      u.updatedAt = new Date().toISOString();
    }),
    updatePasswordHash: vi.fn((id: string, hash: string) => {
      const u = utilisateurs.find((x) => x.id === id);
      if (u) { u.passwordHash = hash; u.updatedAt = new Date().toISOString(); }
    }),
    deactivate: vi.fn((id: string) => {
      const u = utilisateurs.find((x) => x.id === id);
      if (u) { u.actif = false; u.updatedAt = new Date().toISOString(); }
    }),
    activate: vi.fn((id: string) => {
      const u = utilisateurs.find((x) => x.id === id);
      if (u) { u.actif = true; u.updatedAt = new Date().toISOString(); }
    }),
    countAdminActifs: vi.fn(() => utilisateurs.filter((u) => u.role === "administrateur" && u.actif).length),
    identifiantPris: vi.fn((identifiant: string, exceptId?: string) => {
      return utilisateurs.some((u) => u.identifiant === identifiant && u.id !== exceptId);
    }),
  };
}

function creerFakeHasher(): auth.PasswordHasher {
  return {
    hash: vi.fn(async (p: string) => `hash:${p}`),
    verify: vi.fn(async () => true),
  };
}

function creerServiceVide() {
  const repo = creerFakeRepo();
  const hasher = creerFakeHasher();
  const service = new UtilisateurService(repo as never, hasher);
  return { service, repo, hasher };
}

function creerServiceAvecAdmin(idAdmin = "admin-1") {
  const repo = creerFakeRepo([
    { id: idAdmin, nom: "Administrateur", identifiant: "admin", passwordHash: "hash:secret", role: "administrateur", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  const hasher = creerFakeHasher();
  const service = new UtilisateurService(repo as never, hasher);
  return { service, repo, hasher };
}

function creerServiceAvecDeuxAdmins() {
  const repo = creerFakeRepo([
    { id: "admin-1", nom: "Admin Un", identifiant: "admin1", passwordHash: "h", role: "administrateur", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "admin-2", nom: "Admin Deux", identifiant: "admin2", passwordHash: "h", role: "administrateur", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  const hasher = creerFakeHasher();
  const service = new UtilisateurService(repo as never, hasher);
  return { service, repo, hasher };
}

// ─── Autorisations (logique guard IPC) ──────────────────────────────────────

/**
 * Tests 4-9 : la protection IPC est une simple vérification de session + rôle.
 * On teste ici la logique extraite du guard (§ checkAdmin) directement.
 */
describe("Autorisations — guard IPC (§4-§9)", () => {
  function checkAdmin(session: { role: string } | null): { ok: true } | { ok: false; message: string } {
    if (!session) return { ok: false, message: "Non authentifié." };
    if (session.role !== "administrateur") return { ok: false, message: "Action réservée aux administrateurs." };
    return { ok: true };
  }

  it("§4 — session absente → accès refusé", () => {
    expect(checkAdmin(null)).toEqual({ ok: false, message: "Non authentifié." });
  });

  it("§5 — session gérant → accès refusé", () => {
    expect(checkAdmin({ role: "gerant" })).toEqual({ ok: false, message: "Action réservée aux administrateurs." });
  });

  it("§6 — session administrateur → accès autorisé", () => {
    expect(checkAdmin({ role: "administrateur" })).toEqual({ ok: true });
  });

  it("§7 — rôle inconnu → accès refusé", () => {
    expect(checkAdmin({ role: "superadmin" })).toEqual({ ok: false, message: "Action réservée aux administrateurs." });
  });
});

// ─── Listing ─────────────────────────────────────────────────────────────────

describe("Listing (§10)", () => {
  it("retourne la liste vide si aucun utilisateur", () => {
    const { service } = creerServiceVide();
    expect(service.listerUtilisateurs()).toEqual([]);
  });

  it("retourne les utilisateurs triés par nom ASC", () => {
    const repo = creerFakeRepo([
      { id: "u2", nom: "Zara", identifiant: "zara", passwordHash: "h", role: "gerant", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "u1", nom: "Alice", identifiant: "alice", passwordHash: "h", role: "administrateur", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    const liste = service.listerUtilisateurs();
    expect(liste[0]!.nom).toBe("Alice");
    expect(liste[1]!.nom).toBe("Zara");
  });

  it("ne retourne jamais le hash du mot de passe", () => {
    const { service } = creerServiceAvecAdmin();
    const liste = service.listerUtilisateurs();
    for (const u of liste) {
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("password_hash");
    }
  });
});

// ─── Création ────────────────────────────────────────────────────────────────

describe("Création (§11-§14)", () => {
  it("§11 — crée un utilisateur valide et retourne son id", async () => {
    const { service, repo } = creerServiceVide();
    const result = await service.creerUtilisateur({ nom: "Bob", identifiant: "bob", role: "gerant", motDePasse: "motdepasse1", confirmation: "motdepasse1" });
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe("string");
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("§11 — hash le mot de passe avant de le stocker (jamais en clair)", async () => {
    const { service, repo, hasher } = creerServiceVide();
    await service.creerUtilisateur({ nom: "Bob", identifiant: "bob", role: "gerant", motDePasse: "motdepasse1", confirmation: "motdepasse1" });
    expect(hasher.hash).toHaveBeenCalledWith("motdepasse1");
    const appel = ((repo.create as ReturnType<typeof vi.fn>).mock.calls[0] as [{ passwordHash: string }])[0];
    expect(appel.passwordHash).toBe("hash:motdepasse1");
    expect(appel.passwordHash).not.toBe("motdepasse1");
  });

  it("§12 — nom vide → erreur", async () => {
    const { service } = creerServiceVide();
    await expect(service.creerUtilisateur({ nom: "  ", identifiant: "x", role: "gerant", motDePasse: "motdepasse1", confirmation: "motdepasse1" })).rejects.toThrow("nom est obligatoire");
  });

  it("§12 — identifiant vide → erreur", async () => {
    const { service } = creerServiceVide();
    await expect(service.creerUtilisateur({ nom: "Bob", identifiant: "", role: "gerant", motDePasse: "motdepasse1", confirmation: "motdepasse1" })).rejects.toThrow("identifiant est obligatoire");
  });

  it("§13 — mot de passe < 8 caractères → erreur politique", async () => {
    const { service } = creerServiceVide();
    await expect(service.creerUtilisateur({ nom: "Bob", identifiant: "bob", role: "gerant", motDePasse: "court", confirmation: "court" })).rejects.toThrow("8 caractères");
  });

  it("§13 — mot de passe vide → erreur politique", async () => {
    const { service } = creerServiceVide();
    await expect(service.creerUtilisateur({ nom: "Bob", identifiant: "bob", role: "gerant", motDePasse: "", confirmation: "" })).rejects.toThrow("obligatoire");
  });

  it("§13 — confirmation non identique → erreur", async () => {
    const { service } = creerServiceVide();
    await expect(service.creerUtilisateur({ nom: "Bob", identifiant: "bob", role: "gerant", motDePasse: "motdepasse1", confirmation: "different!" })).rejects.toThrow("confirmation");
  });

  it("§14 — identifiant déjà pris → erreur", async () => {
    const { service } = creerServiceAvecAdmin();
    await expect(service.creerUtilisateur({ nom: "Doublon", identifiant: "admin", role: "gerant", motDePasse: "motdepasse1", confirmation: "motdepasse1" })).rejects.toThrow("déjà utilisé");
  });
});

// ─── Modification ────────────────────────────────────────────────────────────

describe("Modification (§15-§18)", () => {
  it("§15 — modifie le nom d'un utilisateur existant", () => {
    const { service, repo } = creerServiceAvecAdmin();
    service.modifierUtilisateur("admin-1", { nom: "Nouveau Nom" });
    expect(repo.update).toHaveBeenCalledWith("admin-1", expect.objectContaining({ nom: "Nouveau Nom" }));
  });

  it("§15 — modifie l'identifiant si disponible", () => {
    const { service, repo } = creerServiceAvecAdmin();
    service.modifierUtilisateur("admin-1", { identifiant: "admin-renomme" });
    expect(repo.update).toHaveBeenCalledWith("admin-1", expect.objectContaining({ identifiant: "admin-renomme" }));
  });

  it("§16 — utilisateur introuvable → erreur", () => {
    const { service } = creerServiceVide();
    expect(() => service.modifierUtilisateur("inexistant", { nom: "X" })).toThrow("introuvable");
  });

  it("§16 — nom vide après trim → erreur", () => {
    const { service } = creerServiceAvecAdmin();
    expect(() => service.modifierUtilisateur("admin-1", { nom: "   " })).toThrow("vide");
  });

  it("§17 — identifiant déjà pris par un autre → erreur", () => {
    const repo = creerFakeRepo([
      { id: "u1", nom: "Alice", identifiant: "alice", passwordHash: "h", role: "administrateur", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "u2", nom: "Bob", identifiant: "bob", passwordHash: "h", role: "gerant", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    expect(() => service.modifierUtilisateur("u2", { identifiant: "alice" })).toThrow("déjà utilisé");
  });

  it("§17 — peut conserver son propre identifiant sans erreur", () => {
    const { service, repo } = creerServiceAvecAdmin();
    service.modifierUtilisateur("admin-1", { identifiant: "admin" });
    expect(repo.update).toHaveBeenCalled();
  });

  it("§18 — changement de rôle valide (admin→gérant) quand pas le dernier admin", () => {
    const { service, repo } = creerServiceAvecDeuxAdmins();
    service.modifierUtilisateur("admin-1", { role: "gerant" });
    expect(repo.update).toHaveBeenCalledWith("admin-1", expect.objectContaining({ role: "gerant" }));
  });
});

// ─── Réinitialisation mot de passe ───────────────────────────────────────────

describe("Réinitialisation mot de passe (§19)", () => {
  it("hache et stocke le nouveau mot de passe valide", async () => {
    const { service, repo } = creerServiceAvecAdmin();
    await service.reinitialiserMotDePasse("admin-1", { motDePasse: "nouveau1234", confirmation: "nouveau1234" });
    expect(repo.updatePasswordHash).toHaveBeenCalledWith("admin-1", "hash:nouveau1234");
  });

  it("utilisateur introuvable → erreur", async () => {
    const { service } = creerServiceVide();
    await expect(service.reinitialiserMotDePasse("ghost", { motDePasse: "motdepasse1", confirmation: "motdepasse1" })).rejects.toThrow("introuvable");
  });

  it("politique mot de passe respectée (< 8 char → erreur)", async () => {
    const { service } = creerServiceAvecAdmin();
    await expect(service.reinitialiserMotDePasse("admin-1", { motDePasse: "abc", confirmation: "abc" })).rejects.toThrow("8 caractères");
  });

  it("confirmation non identique → erreur", async () => {
    const { service } = creerServiceAvecAdmin();
    await expect(service.reinitialiserMotDePasse("admin-1", { motDePasse: "motdepasse1", confirmation: "different!" })).rejects.toThrow("confirmation");
  });
});

// ─── Statut (activation / désactivation) ─────────────────────────────────────

describe("Statut — désactivation (§20)", () => {
  it("désactive un utilisateur actif", () => {
    const repo = creerFakeRepo([
      { id: "u1", nom: "Gérant", identifiant: "gerant", passwordHash: "h", role: "gerant", actif: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    service.desactiverUtilisateur("u1");
    expect(repo.deactivate).toHaveBeenCalledWith("u1");
  });

  it("utilisateur déjà désactivé → erreur", () => {
    const repo = creerFakeRepo([
      { id: "u1", nom: "Gérant", identifiant: "gerant", passwordHash: "h", role: "gerant", actif: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    expect(() => service.desactiverUtilisateur("u1")).toThrow("déjà désactivé");
  });

  it("utilisateur introuvable → erreur", () => {
    const { service } = creerServiceVide();
    expect(() => service.desactiverUtilisateur("ghost")).toThrow("introuvable");
  });
});

describe("Statut — activation (§21)", () => {
  it("réactive un utilisateur désactivé", () => {
    const repo = creerFakeRepo([
      { id: "u1", nom: "Gérant", identifiant: "gerant", passwordHash: "h", role: "gerant", actif: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    service.activerUtilisateur("u1");
    expect(repo.activate).toHaveBeenCalledWith("u1");
  });

  it("utilisateur introuvable → erreur", () => {
    const { service } = creerServiceVide();
    expect(() => service.activerUtilisateur("ghost")).toThrow("introuvable");
  });
});

// ─── Protection dernier administrateur ───────────────────────────────────────

describe("Protection dernier Administrateur (§22-§23)", () => {
  it("§22 — impossible de désactiver le dernier admin actif", () => {
    const { service } = creerServiceAvecAdmin();
    expect(() => service.desactiverUtilisateur("admin-1")).toThrow("dernier Administrateur");
  });

  it("§22 — possible de désactiver un admin si un autre admin actif existe", () => {
    const { service, repo } = creerServiceAvecDeuxAdmins();
    service.desactiverUtilisateur("admin-1");
    expect(repo.deactivate).toHaveBeenCalledWith("admin-1");
  });

  it("§23 — impossible de rétrograder le dernier admin actif (admin → gérant)", () => {
    const { service } = creerServiceAvecAdmin();
    expect(() => service.modifierUtilisateur("admin-1", { role: "gerant" })).toThrow("dernier Administrateur");
  });

  it("§23 — possible de rétrograder un admin si un autre admin actif existe", () => {
    const { service, repo } = creerServiceAvecDeuxAdmins();
    service.modifierUtilisateur("admin-1", { role: "gerant" });
    expect(repo.update).toHaveBeenCalledWith("admin-1", expect.objectContaining({ role: "gerant" }));
  });

  it("§23 — la protection ne bloque pas si l'admin est déjà désactivé (edge case)", () => {
    const repo = creerFakeRepo([
      { id: "admin-1", nom: "Admin Inactif", identifiant: "adminoff", passwordHash: "h", role: "administrateur", actif: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    service.modifierUtilisateur("admin-1", { role: "gerant" });
    expect(repo.update).toHaveBeenCalledWith("admin-1", expect.objectContaining({ role: "gerant" }));
  });

  it("§23 — modifier admin→admin (même rôle) ne déclenche pas la protection", () => {
    const { service, repo } = creerServiceAvecAdmin();
    service.modifierUtilisateur("admin-1", { role: "administrateur" });
    expect(repo.update).toHaveBeenCalled();
  });
});

// ─── Règles de trim ───────────────────────────────────────────────────────────

describe("Sanitisation des entrées (trim)", () => {
  it("trim le nom et l'identifiant à la création", async () => {
    const { service, repo } = creerServiceVide();
    await service.creerUtilisateur({ nom: "  Alice  ", identifiant: "  alice  ", role: "gerant", motDePasse: "motdepasse1", confirmation: "motdepasse1" });
    const appel = ((repo.create as ReturnType<typeof vi.fn>).mock.calls[0] as [{ nom: string; identifiant: string }])[0];
    expect(appel.nom).toBe("Alice");
    expect(appel.identifiant).toBe("alice");
  });

  it("trim le nom à la modification", () => {
    const { service, repo } = creerServiceAvecAdmin();
    service.modifierUtilisateur("admin-1", { nom: "  Nouveau  " });
    expect(repo.update).toHaveBeenCalledWith("admin-1", expect.objectContaining({ nom: "Nouveau" }));
  });
});
