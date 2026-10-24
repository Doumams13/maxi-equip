import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { FactureRepository } from "./factureRepository.js";
import type { LigneFacture } from "@maxi-equip/shared-types";

const CHEMIN_DB = join(tmpdir(), "test-facture-repository.sqlite");

function ouvrirBaseDeTest(): Database.Database {
  if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  const db = new Database(CHEMIN_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function ligne(partiel: Partial<LigneFacture> & { reference: string | null; motif: string; taille: string; quantite: number }): LigneFacture {
  return {
    produitId: null,
    prixUnitaire: 1000,
    prixUnitaireNormal: null,
    promotionId: null,
    promotionLibelle: null,
    promotionType: null,
    promotionValeur: null,
    surfaceCartonM2: null,
    ...partiel,
  };
}

function creerFacture(
  repository: FactureRepository,
  input: { numero: string; date: string; lignes: LigneFacture[]; total: number; remise?: number }
): string {
  const remise = input.remise ?? 0;
  return repository.create({
    numero: input.numero,
    date: input.date,
    emplacementId: "shop",
    clientNom: "Client Test",
    clientTelephone: null,
    clientAdresse: null,
    vendeurUtilisateurId: "u1",
    vendeurNomManuel: null,
    modeReglement: "Espèces",
    lignes: input.lignes,
    total: input.total,
    remise,
    statutPaiement: "payee",
    montantPaye: input.total - remise,
    identiteSnapshot: null,
  });
}

function creerEmplacementShop(db: Database.Database): void {
  const maintenant = new Date().toISOString();
  db.prepare(
    "INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, created_at, updated_at) VALUES ('shop', 'SHOP', 'shop', 'Libreville', 1, ?, ?)"
  ).run(maintenant, maintenant);
  db.prepare(
    "INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u1', 'Testeur', 'testeur', 'x', 'administrateur', ?, ?)"
  ).run(maintenant, maintenant);
}

describe("FactureRepository.topProduitsVendus — motif → référence (base réelle)", () => {
  let db: Database.Database;
  let repository: FactureRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new FactureRepository(db);
    creerEmplacementShop(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  // RÉGRESSION bug réel (correction "motif → référence", 2026-10-21) : deux
  // variantes PARTAGEANT LE MÊME MOTIF (ex. deux tailles d'un même carreau)
  // ne doivent jamais être fusionnées sous un même libellé — la référence
  // les distingue, le motif seul ne le permettait pas.
  it("distingue deux variantes de même motif par leur référence, jamais fusionnées", () => {
    creerFacture(repository, {
      numero: "FAC-1",
      date: "2026-01-01T00:00:00.000Z",
      total: 8000,
      lignes: [ligne({ reference: "MB-6060", motif: "Marbre Blanc", taille: "60x60", quantite: 2, prixUnitaire: 4000 })],
    });
    creerFacture(repository, {
      numero: "FAC-2",
      date: "2026-01-02T00:00:00.000Z",
      total: 6000,
      lignes: [ligne({ reference: "MB-3030", motif: "Marbre Blanc", taille: "30x30", quantite: 3, prixUnitaire: 2000 })],
    });

    const top = repository.topProduitsVendus(10);
    const labels = top.map((t) => t.label);
    expect(labels).toContain("MB-6060");
    expect(labels).toContain("MB-3030");
    expect(labels).not.toContain("Marbre Blanc — 60x60");
  });

  it("replie sur motif + taille UNIQUEMENT pour une ligne historique sans référence (reference NULL)", () => {
    creerFacture(repository, {
      numero: "FAC-3",
      date: "2026-01-01T00:00:00.000Z",
      total: 4000,
      lignes: [ligne({ reference: null, motif: "Marbre Blanc", taille: "60x60", quantite: 1, prixUnitaire: 4000 })],
    });

    const top = repository.topProduitsVendus(10);
    expect(top.map((t) => t.label)).toContain("Marbre Blanc — 60x60");
  });

  it("exclut les factures annulées de l'agrégation", () => {
    const id = creerFacture(repository, {
      numero: "FAC-4",
      date: "2026-01-01T00:00:00.000Z",
      total: 4000,
      lignes: [ligne({ reference: "ANNUL-1", motif: "X", taille: "Y", quantite: 5, prixUnitaire: 800 })],
    });
    db.prepare("UPDATE factures SET annulee_le = ? WHERE id = ?").run(new Date().toISOString(), id);

    const top = repository.topProduitsVendus(10);
    expect(top.find((t) => t.label === "ANNUL-1")).toBeUndefined();
  });
});

describe("FactureRepository.sommeTotalJourCourant — correction 'voir le revenu journalier' (base réelle)", () => {
  let db: Database.Database;
  let repository: FactureRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new FactureRepository(db);
    creerEmplacementShop(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("ne compte que les factures actives datées d'aujourd'hui, jamais celles d'un autre jour ni les annulées", () => {
    const maintenant = new Date().toISOString();
    const hier = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    creerFacture(repository, { numero: "FAC-J1", date: maintenant, total: 5000, lignes: [ligne({ reference: "R1", motif: "X", taille: "Y", quantite: 1 })] });
    creerFacture(repository, { numero: "FAC-J2", date: maintenant, total: 3000, lignes: [ligne({ reference: "R2", motif: "X", taille: "Y", quantite: 1 })] });
    creerFacture(repository, { numero: "FAC-HIER", date: hier, total: 9000, lignes: [ligne({ reference: "R3", motif: "X", taille: "Y", quantite: 1 })] });
    const idAnnulee = creerFacture(repository, { numero: "FAC-ANNUL", date: maintenant, total: 1000, lignes: [ligne({ reference: "R4", motif: "X", taille: "Y", quantite: 1 })] });
    db.prepare("UPDATE factures SET annulee_le = ? WHERE id = ?").run(maintenant, idAnnulee);

    expect(repository.sommeTotalJourCourant()).toBe(8000);
  });
});

/**
 * Bilan d'activité (2026-10-21) — agrégats sur une plage de dates LIBRE,
 * contrairement à sommeTotalJourCourant/MoisCourant (bornées au
 * jour/mois en cours).
 */
describe("FactureRepository.bilanVentesEntre / topProduitsVendusEntre — plage libre (base réelle)", () => {
  let db: Database.Database;
  let repository: FactureRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new FactureRepository(db);
    creerEmplacementShop(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  it("agrège CA, nombre de factures et remises UNIQUEMENT sur la plage demandée, factures actives seulement", () => {
    creerFacture(repository, { numero: "FAC-1", date: "2026-01-05T00:00:00.000Z", total: 10000, remise: 1000, lignes: [ligne({ reference: "R1", motif: "X", taille: "Y", quantite: 1 })] });
    creerFacture(repository, { numero: "FAC-2", date: "2026-01-20T00:00:00.000Z", total: 5000, remise: 500, lignes: [ligne({ reference: "R2", motif: "X", taille: "Y", quantite: 1 })] });
    // Hors plage (décembre) — ne doit jamais être comptée.
    creerFacture(repository, { numero: "FAC-HORS", date: "2025-12-31T00:00:00.000Z", total: 99999, lignes: [ligne({ reference: "R3", motif: "X", taille: "Y", quantite: 1 })] });
    // Annulée, dans la plage — ne doit jamais être comptée.
    const idAnnulee = creerFacture(repository, { numero: "FAC-ANNUL", date: "2026-01-10T00:00:00.000Z", total: 50000, lignes: [ligne({ reference: "R4", motif: "X", taille: "Y", quantite: 1 })] });
    db.prepare("UPDATE factures SET annulee_le = ? WHERE id = ?").run(new Date().toISOString(), idAnnulee);

    const resultat = repository.bilanVentesEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");
    expect(resultat).toEqual({ caTotal: 15000, nombreFactures: 2, remiseTotale: 1500 });
  });

  it("topProduitsVendusEntre ne classe que les ventes de la plage demandée", () => {
    creerFacture(repository, { numero: "FAC-1", date: "2026-01-05T00:00:00.000Z", total: 4000, lignes: [ligne({ reference: "DANS-PLAGE", motif: "X", taille: "Y", quantite: 4 })] });
    creerFacture(repository, { numero: "FAC-HORS", date: "2025-12-31T00:00:00.000Z", total: 99000, lignes: [ligne({ reference: "HORS-PLAGE", motif: "X", taille: "Y", quantite: 99 })] });

    const top = repository.topProduitsVendusEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z", 10);
    const labels = top.map((t) => t.label);
    expect(labels).toContain("DANS-PLAGE");
    expect(labels).not.toContain("HORS-PLAGE");
  });

  it("renvoie des totaux à zéro (jamais une exception) quand aucune facture ne tombe dans la plage", () => {
    creerFacture(repository, { numero: "FAC-HORS", date: "2025-01-01T00:00:00.000Z", total: 1000, lignes: [ligne({ reference: "R1", motif: "X", taille: "Y", quantite: 1 })] });
    const resultat = repository.bilanVentesEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");
    expect(resultat).toEqual({ caTotal: 0, nombreFactures: 0, remiseTotale: 0 });
    expect(repository.topProduitsVendusEntre("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z")).toEqual([]);
  });
});

describe("FactureRepository.listAvecVendeurPagine — recherche texte, y compris le vendeur (base réelle)", () => {
  let db: Database.Database;
  let repository: FactureRepository;

  beforeEach(() => {
    db = ouvrirBaseDeTest();
    repository = new FactureRepository(db);
    creerEmplacementShop(db); // crée 'u1' ("Testeur", administrateur)
    const maintenant = new Date().toISOString();
    db.prepare(
      "INSERT INTO utilisateurs (id, nom, identifiant, password_hash, role, created_at, updated_at) VALUES ('u2', 'Awa Ndiaye', 'awa', 'x', 'gerant', ?, ?)"
    ).run(maintenant, maintenant);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    if (existsSync(CHEMIN_DB)) unlinkSync(CHEMIN_DB);
  });

  function creerFactureVendeur(numero: string, vendeurUtilisateurId: string, vendeurNomManuel: string | null): void {
    repository.create({
      numero,
      date: new Date().toISOString(),
      emplacementId: "shop",
      clientNom: "Client X",
      clientTelephone: null,
      clientAdresse: null,
      vendeurUtilisateurId,
      vendeurNomManuel,
      modeReglement: "Espèces",
      lignes: [ligne({ reference: "R1", motif: "X", taille: "Y", quantite: 1 })],
      total: 1000,
      remise: 0,
      statutPaiement: "payee",
      montantPaye: 1000,
      identiteSnapshot: null,
    });
  }

  function rechercher(recherche: string, inclureVendeurDansRecherche: boolean) {
    return repository.listAvecVendeurPagine({
      recherche,
      statutFiltre: "tous",
      vendeurUtilisateurId: null,
      inclureVendeurDansRecherche,
      colonneTri: null,
      direction: "desc",
      page: 1,
      tailleParPage: 20,
    });
  }

  it("avec inclureVendeurDansRecherche=true, trouve aussi par nom du vendeur (compte réellement utilisé)", () => {
    creerFactureVendeur("FAC-1", "u2", null); // Awa Ndiaye
    creerFactureVendeur("FAC-2", "u1", null); // Testeur

    const { resultats, totalResultats } = rechercher("Ndiaye", true);
    expect(totalResultats).toBe(1);
    expect(resultats[0]!.numero).toBe("FAC-1");
  });

  it("avec inclureVendeurDansRecherche=true, trouve aussi par vendeurNomManuel (Corrections §7)", () => {
    creerFactureVendeur("FAC-3", "u1", "Paul Obame");

    const { resultats, totalResultats } = rechercher("Obame", true);
    expect(totalResultats).toBe(1);
    expect(resultats[0]!.numero).toBe("FAC-3");
  });

  it("avec inclureVendeurDansRecherche=false (Gérant), une recherche par nom de vendeur ne retourne RIEN — jamais de fuite d'identité via la recherche, même partielle", () => {
    creerFactureVendeur("FAC-1", "u2", null); // Awa Ndiaye

    const { resultats, totalResultats } = rechercher("Ndiaye", false);
    expect(totalResultats).toBe(0);
    expect(resultats).toEqual([]);
  });

  it("la recherche par numéro/client reste inchangée, quelle que soit la valeur de inclureVendeurDansRecherche", () => {
    creerFactureVendeur("FAC-UNIQUE", "u1", null);

    expect(rechercher("FAC-UNIQUE", false).totalResultats).toBe(1);
    expect(rechercher("FAC-UNIQUE", true).totalResultats).toBe(1);
  });
});
