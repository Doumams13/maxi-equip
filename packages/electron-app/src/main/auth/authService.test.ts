import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { UtilisateurRepository } from "./utilisateurRepository.js";
import { Argon2idPasswordHasher } from "./argon2Hasher.js";
import { SessionManager } from "./sessionManager.js";
import { AuthService } from "./authService.js";
import type { ResultatLoginCentral } from "./loginCentralService.js";

/**
 * Correction "travail à distance / plusieurs machines en parallèle"
 * (2026-10-22) — tests réels (vraie base SQLite en mémoire, vrai hasher
 * Argon2id) de AuthService, y compris le nouveau branchement vers la
 * connexion centrale. Le réseau lui-même (appel HTTP) est simulé par un
 * faux `LoginCentralService` minimal — déjà prouvé réellement côté API
 * (packages/api/src/comptesEtOperationsStock.test.ts).
 */

class FauxLoginCentral {
  constructor(
    private readonly configuree: boolean,
    private readonly reponse: ResultatLoginCentral
  ) {}
  appels: { identifiant: string; motDePasse: string }[] = [];
  estConfiguree(): boolean {
    return this.configuree;
  }
  async login(identifiant: string, motDePasse: string): Promise<ResultatLoginCentral> {
    this.appels.push({ identifiant, motDePasse });
    return this.reponse;
  }
}

function ouvrirBaseDeTest(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("AuthService", () => {
  let db: Database.Database;
  let repository: UtilisateurRepository;
  let hasher: Argon2idPasswordHasher;
  let session: SessionManager;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new UtilisateurRepository(db);
    hasher = new Argon2idPasswordHasher();
    session = new SessionManager();
  });

  afterEach(() => {
    db.close();
  });

  describe("sans LoginCentralService (comportement historique)", () => {
    it("connexion locale réussie avec le bon mot de passe", async () => {
      const hash = await hasher.hash("motdepasse123");
      repository.create({ nom: "Jean", identifiant: "jean", passwordHash: hash, role: "administrateur" });
      const service = new AuthService(repository, hasher, session);

      const resultat = await service.login("jean", "motdepasse123");

      expect(resultat.success).toBe(true);
      expect(resultat.success && resultat.session.identifiant).toBe("jean");
      expect(service.getSession()?.identifiant).toBe("jean");
    });

    it("refuse un mauvais mot de passe", async () => {
      const hash = await hasher.hash("motdepasse123");
      repository.create({ nom: "Jean", identifiant: "jean", passwordHash: hash, role: "administrateur" });
      const service = new AuthService(repository, hasher, session);

      const resultat = await service.login("jean", "faux");

      expect(resultat.success).toBe(false);
      expect(!resultat.success && resultat.reason).toBe("WRONG_PASSWORD");
    });
  });

  describe("avec LoginCentralService configuré (connexion en ligne)", () => {
    it("succès : ouvre la session avec les données du serveur, jamais recalculées localement, et crée le miroir local", async () => {
      const faux = new FauxLoginCentral(true, {
        success: true,
        jwt: "jwt-de-test",
        compte: { id: "compte-distant-1", identifiant: "gerant.akanda", nom: "Awa Ndiaye", role: "gerant" },
      });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("gerant.akanda", "peu-importe-le-mot-de-passe-local");

      expect(faux.appels).toEqual([{ identifiant: "gerant.akanda", motDePasse: "peu-importe-le-mot-de-passe-local" }]);
      expect(resultat.success).toBe(true);
      expect(resultat.success && resultat.session).toMatchObject({ userId: "compte-distant-1", identifiant: "gerant.akanda", nom: "Awa Ndiaye", role: "gerant" });

      // Miroir local créé — consultable au prochain démarrage sans réseau.
      const local = repository.findById("compte-distant-1");
      expect(local).toMatchObject({ identifiant: "gerant.akanda", nom: "Awa Ndiaye", role: "gerant", actif: true });
    });

    it("jamais la base locale qui décide — identifiant inexistant localement fonctionne quand même", async () => {
      expect(repository.findByIdentifiant("jamais-vu-ici")).toBeNull();
      const faux = new FauxLoginCentral(true, {
        success: true,
        jwt: "jwt",
        compte: { id: "c1", identifiant: "jamais-vu-ici", nom: "X", role: "gerant" },
      });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("jamais-vu-ici", "x");
      expect(resultat.success).toBe(true);
    });

    it("échec 'identifiants_invalides' → reason WRONG_PASSWORD (même message générique que le local)", async () => {
      const faux = new FauxLoginCentral(true, { success: false, raison: "identifiants_invalides", message: "Identifiant ou mot de passe incorrect." });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("x", "y");
      expect(resultat.success).toBe(false);
      expect(!resultat.success && resultat.reason).toBe("WRONG_PASSWORD");
    });

    it("échec 'trop_de_tentatives' → reason TROP_DE_TENTATIVES, message du serveur transmis", async () => {
      const faux = new FauxLoginCentral(true, { success: false, raison: "trop_de_tentatives", message: "Réessayez dans 300 secondes." });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("x", "y");
      expect(resultat.success).toBe(false);
      expect(!resultat.success && resultat.reason).toBe("TROP_DE_TENTATIVES");
      expect(!resultat.success && resultat.message).toBe("Réessayez dans 300 secondes.");
    });

    it("système multiposte fiable (2026-10-28) : échec 'poste_bloque' → reason POSTE_BLOQUE, jamais WRONG_PASSWORD", async () => {
      const faux = new FauxLoginCentral(true, { success: false, raison: "poste_bloque", message: "Ce poste a été bloqué par un administrateur." });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("x", "y");
      expect(resultat.success).toBe(false);
      expect(!resultat.success && resultat.reason).toBe("POSTE_BLOQUE");
      expect(!resultat.success && resultat.message).toBe("Ce poste a été bloqué par un administrateur.");
    });

    it("échec 'hors_ligne' (serveur injoignable) → reason CONNEXION_REQUISE, jamais un repli silencieux sur la base locale", async () => {
      const faux = new FauxLoginCentral(true, { success: false, raison: "hors_ligne", message: "Connexion internet requise pour se connecter depuis ce poste : timeout." });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("x", "y");
      expect(resultat.success).toBe(false);
      expect(!resultat.success && resultat.reason).toBe("CONNEXION_REQUISE");
    });

    it("une MODIFICATION ultérieure du rôle côté serveur écrase le miroir local, mais ne touche jamais le password_hash existant", async () => {
      const hashLocalOriginal = await hasher.hash("mot-de-passe-local-original");
      repository.create({ nom: "Admin Historique", identifiant: "admin", passwordHash: hashLocalOriginal, role: "administrateur" });
      const localAvant = repository.findByIdentifiant("admin");
      expect(localAvant).not.toBeNull();

      const faux = new FauxLoginCentral(true, {
        success: true,
        jwt: "jwt",
        compte: { id: localAvant!.id, identifiant: "admin", nom: "Admin Historique", role: "gerant" }, // rôle changé côté serveur
      });
      const service = new AuthService(repository, hasher, session, faux as never);
      await service.login("admin", "peu-importe");

      const localApres = repository.findByIdentifiant("admin");
      expect(localApres?.role).toBe("gerant"); // mis à jour
      expect(localApres?.passwordHash).toBe(hashLocalOriginal); // jamais touché
    });
  });

  describe("estConfiguree() false malgré un LoginCentralService fourni", () => {
    it("reste 100% local — le service distant n'est jamais appelé", async () => {
      const hash = await hasher.hash("motdepasse123");
      repository.create({ nom: "Jean", identifiant: "jean", passwordHash: hash, role: "administrateur" });
      const faux = new FauxLoginCentral(false, { success: true, jwt: "jamais-utilise", compte: { id: "x", identifiant: "x", nom: "x", role: "gerant" } });
      const service = new AuthService(repository, hasher, session, faux as never);

      const resultat = await service.login("jean", "motdepasse123");

      expect(faux.appels).toHaveLength(0);
      expect(resultat.success).toBe(true);
      expect(resultat.success && resultat.session.identifiant).toBe("jean");
    });
  });
});
