import { describe, it, expect, vi } from "vitest";
import type { auth } from "@maxi-equip/domain";
import type { Role } from "@maxi-equip/shared-types";
import { UtilisateurService } from "../services/utilisateurService.js";
import type { UtilisateurPublic } from "../auth/utilisateurRepository.js";
import { estSetupRequis, creerAdminInitial } from "./setup.js";

/**
 * Tests de la configuration initiale (Phase 6C) — remplace le mot de
 * passe Administrateur généré aléatoirement (abandonné). Fake
 * repository (aucune dépendance SQLite/Electron — jamais de
 * `vi.mock("electron")` dans ce projet, voir metier.catalogSync.test.ts),
 * même style que utilisateurService.test.ts.
 */

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

function creerFakeRepo(seed: UtilisateurFake[] = []) {
  const utilisateurs: UtilisateurFake[] = seed.map((u) => ({ ...u }));
  let nextId = 1;

  return {
    _data: utilisateurs,
    count: vi.fn((): number => utilisateurs.length),
    findById: vi.fn((id: string) => {
      const u = utilisateurs.find((x) => x.id === id);
      if (!u) return null;
      return { id: u.id, nom: u.nom, identifiant: u.identifiant, role: u.role, actif: u.actif };
    }),
    list: vi.fn((): UtilisateurPublic[] =>
      utilisateurs.map((u) => ({
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
      utilisateurs.push({
        id,
        nom: input.nom,
        identifiant: input.identifiant,
        passwordHash: input.passwordHash,
        role: input.role,
        actif: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return id;
    }),
    update: vi.fn(),
    updatePasswordHash: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
    countAdminActifs: vi.fn(() => utilisateurs.filter((u) => u.role === "administrateur" && u.actif).length),
    identifiantPris: vi.fn((identifiant: string, exceptId?: string) =>
      utilisateurs.some((u) => u.identifiant === identifiant && u.id !== exceptId)
    ),
  };
}

function creerFakeHasher(): auth.PasswordHasher {
  return {
    hash: vi.fn(async (p: string) => `argon2id:${p}`),
    verify: vi.fn(async () => true),
  };
}

const ADMIN_VALIDE = {
  nom: "Jean Dupont",
  identifiant: "admin",
  motDePasse: "motdepasse1",
  confirmation: "motdepasse1",
};

// ─── §1 — Détection première initialisation ─────────────────────────────────

describe("estSetupRequis — détection première initialisation (§1, §7)", () => {
  it("répond true tant qu'aucun utilisateur n'existe (première installation)", () => {
    const repo = creerFakeRepo();
    expect(estSetupRequis(repo)).toBe(true);
  });

  it("répond false dès qu'au moins un utilisateur existe (§7 — installation déjà initialisée)", () => {
    const repo = creerFakeRepo([
      {
        id: "admin-1",
        nom: "Admin",
        identifiant: "admin",
        passwordHash: "h",
        role: "administrateur",
        actif: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(estSetupRequis(repo)).toBe(false);
  });

  it("répond false même si le seul utilisateur existant est un Gérant (aucun second indicateur dupliqué)", () => {
    const repo = creerFakeRepo([
      {
        id: "u1",
        nom: "Gérant",
        identifiant: "gerant",
        passwordHash: "h",
        role: "gerant",
        actif: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(estSetupRequis(repo)).toBe(false);
  });
});

// ─── §2 — Création de l'Administrateur initial ──────────────────────────────

describe("creerAdminInitial — création du compte Administrateur (§2, §3, §6)", () => {
  it("§2 — crée un utilisateur avec le rôle forcé à administrateur", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    const resultat = await creerAdminInitial(repo, service, ADMIN_VALIDE);
    expect(resultat).toEqual({ success: true });
    expect(repo.create).toHaveBeenCalledOnce();
    const appel = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0] as [{ role: Role }];
    expect(appel[0].role).toBe("administrateur");
  });

  it("§3 — le mot de passe est haché avec le mécanisme Argon2id existant (jamais un second hasher)", async () => {
    const repo = creerFakeRepo();
    const hasher = creerFakeHasher();
    const service = new UtilisateurService(repo as never, hasher);
    await creerAdminInitial(repo, service, ADMIN_VALIDE);
    expect(hasher.hash).toHaveBeenCalledWith(ADMIN_VALIDE.motDePasse);
  });

  it("§4 — le mot de passe en clair n'est jamais stocké : seul le hash est persisté", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    await creerAdminInitial(repo, service, ADMIN_VALIDE);
    const appel = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0] as [{ passwordHash: string }];
    expect(appel[0].passwordHash).not.toBe(ADMIN_VALIDE.motDePasse);
    expect(appel[0].passwordHash).toBe(`argon2id:${ADMIN_VALIDE.motDePasse}`);
    expect(appel[0]).not.toHaveProperty("motDePasse");
  });

  it("§5 — aucun mot de passe n'est généré automatiquement : celui fourni par l'utilisateur est utilisé tel quel", async () => {
    const repo = creerFakeRepo();
    const hasher = creerFakeHasher();
    const service = new UtilisateurService(repo as never, hasher);
    await creerAdminInitial(repo, service, { ...ADMIN_VALIDE, motDePasse: "choixDeLUtilisateur1", confirmation: "choixDeLUtilisateur1" });
    expect(hasher.hash).toHaveBeenCalledWith("choixDeLUtilisateur1");
    expect(hasher.hash).not.toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9!@#%]{14}$/));
  });

  it("§6 — mot de passe et confirmation différents → échec, aucun utilisateur créé", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    const resultat = await creerAdminInitial(repo, service, { ...ADMIN_VALIDE, confirmation: "autreChose1" });
    expect(resultat.success).toBe(false);
    expect(resultat.message).toMatch(/confirmation/i);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("§6 — mot de passe trop court (politique existante) → échec", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    const resultat = await creerAdminInitial(repo, service, { ...ADMIN_VALIDE, motDePasse: "court", confirmation: "court" });
    expect(resultat.success).toBe(false);
    expect(resultat.message).toMatch(/8 caractères/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("§7 — installation déjà initialisée → refus, aucun second Administrateur créé, base non modifiée", async () => {
    const repo = creerFakeRepo([
      {
        id: "admin-existant",
        nom: "Admin Existant",
        identifiant: "admin-existant",
        passwordHash: "h",
        role: "administrateur",
        actif: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    const resultat = await creerAdminInitial(repo, service, ADMIN_VALIDE);
    expect(resultat.success).toBe(false);
    expect(resultat.message).toMatch(/déjà initialisée/);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo._data).toHaveLength(1);
    expect(repo._data[0]!.id).toBe("admin-existant");
  });

  it("§8 — une erreur métier du service (ex. identifiant déjà pris) est renvoyée comme message, jamais une exception non gérée", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    // Pré-remplit un identifiant qui collisionnera — simulateur d'erreur
    // métier réaliste sans dépasser le repository fake existant.
    repo.identifiantPris.mockReturnValueOnce(true);
    const resultat = await creerAdminInitial(repo, service, ADMIN_VALIDE);
    expect(resultat.success).toBe(false);
    expect(resultat.message).toMatch(/déjà utilisé/);
  });

  it("§9 — ne crée jamais de compte Gérant automatiquement (uniquement l'Administrateur)", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    await creerAdminInitial(repo, service, ADMIN_VALIDE);
    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo._data).toHaveLength(1);
    expect(repo._data.some((u) => u.role === "gerant")).toBe(false);
  });
});

// ─── Intégration estSetupRequis + creerAdminInitial ─────────────────────────

describe("Intégration — cycle complet de configuration initiale (§7 réinstallation)", () => {
  it("estSetupRequis passe de true à false après creerAdminInitial", async () => {
    const repo = creerFakeRepo();
    const service = new UtilisateurService(repo as never, creerFakeHasher());
    expect(estSetupRequis(repo)).toBe(true);
    await creerAdminInitial(repo, service, ADMIN_VALIDE);
    expect(estSetupRequis(repo)).toBe(false);
  });

  it("une base restaurée contenant déjà un Administrateur ne déclenche jamais l'écran de configuration (réinstallation, §7)", () => {
    const repoRestaure = creerFakeRepo([
      {
        id: "admin-1",
        nom: "Admin",
        identifiant: "admin",
        passwordHash: "argon2id:motdepasseOriginal",
        role: "administrateur",
        actif: true,
        createdAt: "2025-06-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
      },
      {
        id: "gerant-1",
        nom: "Gérant",
        identifiant: "gerant",
        passwordHash: "argon2id:autreMotDePasse",
        role: "gerant",
        actif: true,
        createdAt: "2025-06-02T00:00:00.000Z",
        updatedAt: "2025-06-02T00:00:00.000Z",
      },
    ]);
    expect(estSetupRequis(repoRestaure)).toBe(false);
    // Les données existantes (Admin + Gérant) restent inchangées.
    expect(repoRestaure._data).toHaveLength(2);
    expect(repoRestaure._data[0]!.passwordHash).toBe("argon2id:motdepasseOriginal");
  });
});
