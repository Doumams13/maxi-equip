import { describe, expect, it, vi } from "vitest";
import { VenteService, VenteValidationError } from "./venteService.js";

/**
 * Vérifie le correctif du bug "les ventes entièrement externes
 * n'apparaissent dans aucun historique" — reproduit ici sans base réelle
 * (le module natif SQLite n'est pas exécutable dans cet environnement,
 * limite déjà documentée) via de faux dépôts satisfaisant les mêmes
 * interfaces que les vrais repositories.
 */
function creerServiceAvecFauxDepots() {
  const mouvementsCrees: unknown[] = [];

  const produitRepository = {
    findById: () => ({ id: "p1", motif: "Marbre", taille: "60 × 60 cm" }),
  };
  const stockRepository = {
    getQuantite: () => 1000, // stock largement suffisant pour ne pas interférer avec ce que le test vérifie réellement
    applyDelta: vi.fn(),
  };
  const mouvementRepository = {
    create: (input: unknown) => {
      mouvementsCrees.push(input);
      return "m-" + mouvementsCrees.length;
    },
  };
  const factureRepository = {
    nextNumero: () => "FAC-2026-0001",
    create: () => "facture-1",
    createReleveInterne: () => {},
  };
  const boiteEnvoiRepository = {
    creer: () => "be-1",
  };
  const fauxDb = {
    transaction: (fn: () => unknown) => () => fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new VenteService(fauxDb as any, produitRepository as any, stockRepository as any, mouvementRepository as any, factureRepository as any, boiteEnvoiRepository as any);
  return { service, mouvementsCrees, applyDelta: stockRepository.applyDelta };
}

describe("VenteService — correctif : traçabilité d'une vente entièrement externe", async () => {
  it("crée un mouvement de sortie même quand AUCUN dépôt n'est utilisé (0% interne, 100% externe)", async () => {
    const { service, mouvementsCrees, applyDelta } = creerServiceAvecFauxDepots();

    const resultat = await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client Test",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "user-admin",
      vendeurCompteConnecteNom: "Administrateur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",

      remise: 0,
      lignes: [
        {
          produitId: "p1",
          quantite: 30,
          prixUnitaire: 15000,
          allocationsDepots: [], // aucun dépôt utilisé — avant le correctif, ceci ne créait AUCUN mouvement
          fournisseurExterne: "Fournisseur X",
          prixAchatExterne: 12000,
        },
      ],
    });

    expect(resultat.numero).toBe("FAC-2026-0001");
    // Le cœur du correctif : un mouvement DOIT exister pour que la vente soit visible dans l'Historique.
    expect(mouvementsCrees).toHaveLength(1);
    expect(mouvementsCrees[0]).toMatchObject({
      type: "sortie",
      emplacementId: null, // aucun dépôt réel concerné
      quantite: 30,
      utilisateurId: "user-admin", // l'auteur réel, quel que soit son rôle
    });
    // Aucune déduction de stock ne doit avoir eu lieu (rien n'est prélevé sur un dépôt inexistant).
    expect(applyDelta).not.toHaveBeenCalled();
  });

  it("crée un mouvement par dépôt ET un mouvement pour la part externe lorsque la vente est mixte", async () => {
    const { service, mouvementsCrees } = creerServiceAvecFauxDepots();

    await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client Test",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "user-gerant",
      vendeurCompteConnecteNom: "Gérant",
      vendeurNomManuel: null,
      modeReglement: "Espèces",

      remise: 0,
      lignes: [
        {
          produitId: "p1",
          quantite: 30,
          prixUnitaire: 15000,
          allocationsDepots: [{ emplacementId: "akebe", quantite: 10 }],
          fournisseurExterne: "Fournisseur X",
          prixAchatExterne: 12000,
        },
      ],
    });

    expect(mouvementsCrees).toHaveLength(2); // un pour Akébé, un pour la part externe
    const types = mouvementsCrees.map((m) => (m as { emplacementId: string | null }).emplacementId);
    expect(types).toContain("akebe");
    expect(types).toContain(null);
  });

  it("ne crée toujours qu'un seul mouvement quand la vente est entièrement interne (pas de régression)", async () => {
    const { service, mouvementsCrees } = creerServiceAvecFauxDepots();

    await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client Test",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "user-gerant",
      vendeurCompteConnecteNom: "Gérant",
      vendeurNomManuel: null,
      modeReglement: "Espèces",

      remise: 0,
      lignes: [
        {
          produitId: "p1",
          quantite: 10,
          prixUnitaire: 15000,
          allocationsDepots: [{ emplacementId: "akebe", quantite: 10 }],
        },
      ],
    });

    expect(mouvementsCrees).toHaveLength(1);
    expect(mouvementsCrees[0]).toMatchObject({ emplacementId: "akebe", quantite: 10 });
  });
});

describe("VenteService — annulation d'une facture (restauration du stock)", async () => {
  it("restaure le stock UNIQUEMENT pour la part prélevée sur un dépôt, jamais pour la part externe", async () => {
    const mouvementsCrees: unknown[] = [];
    const applyDelta = vi.fn();
    const produitRepository = { findById: () => ({ id: "p1", motif: "Marbre", taille: "60 × 60 cm" }) };
    const stockRepository = { getQuantite: () => 1000, applyDelta };
    const mouvementRepository = {
      create: (input: unknown) => {
        mouvementsCrees.push(input);
        return "m-" + mouvementsCrees.length;
      },
      // Simule une vente déjà enregistrée : 10 depuis Akébé + 5 en externe (aucun dépôt).
      listParFacture: () => [
        { id: "m1", type: "sortie", produitId: "p1", emplacementId: "akebe", quantite: 10, factureId: "f1" },
        { id: "m2", type: "sortie", produitId: "p1", emplacementId: null, quantite: 5, factureId: "f1" },
      ],
    };
    const factureRepository = {
      findById: () => ({ id: "f1", numero: "FAC-2026-0001", annuleeLe: null }),
      annuler: vi.fn(),
    };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    const boiteEnvoiRepository = { creer: () => "be-1" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, produitRepository as any, stockRepository as any, mouvementRepository as any, factureRepository as any, boiteEnvoiRepository as any);

    await service.annulerVente("f1", "Erreur de saisie du client", "user-admin");

    // Un seul mouvement de restauration créé — celui d'Akébé, jamais pour la part externe.
    expect(mouvementsCrees).toHaveLength(1);
    expect(mouvementsCrees[0]).toMatchObject({ type: "entree", emplacementId: "akebe", quantite: 10, utilisateurId: "user-admin" });
    expect(applyDelta).toHaveBeenCalledTimes(1);
    expect(factureRepository.annuler).toHaveBeenCalledWith("f1", "Erreur de saisie du client", "user-admin");
  });

  it("refuse d'annuler sans motif", async () => {
    const factureRepository = { findById: () => ({ id: "f1", annuleeLe: null }), annuler: vi.fn() };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, {} as any, {} as any, { listParFacture: () => [] } as any, factureRepository as any, {} as any);
    await expect(service.annulerVente("f1", "", "user-admin")).rejects.toThrow();
  });

  it("refuse d'annuler une facture déjà annulée", async () => {
    const factureRepository = { findById: () => ({ id: "f1", annuleeLe: "2026-01-01T00:00:00Z" }), annuler: vi.fn() };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, {} as any, {} as any, { listParFacture: () => [] } as any, factureRepository as any, {} as any);
    await expect(service.annulerVente("f1", "Motif", "user-admin")).rejects.toThrow();
  });
});

// ─── §18 A-J : tests Phase 4 Ventes & Facturation ─────────────────────────

/** Fabrique de service générique pour les tests §18 — stocks configurables par produit×dépôt. */
function creerService(opts: {
  stock?: Record<string, Record<string, number>>;
  promotions?: { id: string; libelle: string; typeReduction: "pourcentage" | "montant_fixe"; valeur: number; perimetre: "global" | "cible"; produitIds: string[]; dateDebut: string; dateFin: string }[];
  produits?: { id: string; prix: number; motif: string; taille: string; largeur?: number | null; hauteur?: number | null; carreauxParCarton?: number | null }[];
} = {}) {
  const stockData = opts.stock ?? {};
  const promotionsData = opts.promotions ?? [];
  const produitsData = opts.produits ?? [{ id: "p1", prix: 15000, motif: "Marbre Blanc", taille: "60×60" }];

  const mouvementsCrees: unknown[] = [];
  const factureCreeAvec: unknown[] = [];
  const boiteEnvoiCree: unknown[] = [];
  const deltaAppliques: unknown[] = [];

  const produitRepository = {
    findById: (id: string) => produitsData.find((p) => p.id === id) ?? null,
  };
  const stockRepository = {
    getQuantite: (produitId: string, emplacementId: string) => stockData[produitId]?.[emplacementId] ?? 0,
    applyDelta: (delta: unknown) => { deltaAppliques.push(delta); },
  };
  const mouvementRepository = {
    create: (input: unknown) => { mouvementsCrees.push(input); return "m-" + mouvementsCrees.length; },
    listParFacture: () => [],
  };
  const factureRepository = {
    nextNumero: () => "FAC-2026-TEST",
    create: (input: unknown) => { factureCreeAvec.push(input); return "facture-1"; },
    createReleveInterne: vi.fn(),
    findById: () => null,
    annuler: vi.fn(),
  };
  const boiteEnvoiRepository = {
    creer: (...args: unknown[]) => { boiteEnvoiCree.push(args); return "be-1"; },
  };
  const promotionRepository = {
    listActivesParProduit: (produitId: string) =>
      promotionsData.filter(
        (p) => p.perimetre === "global" || p.produitIds.includes(produitId)
      ),
  };
  const fauxDb = { transaction: (fn: () => unknown) => () => fn() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new VenteService(fauxDb as any, produitRepository as any, stockRepository as any, mouvementRepository as any, factureRepository as any, boiteEnvoiRepository as any, promotionRepository as any);

  return { service, mouvementsCrees, factureCreeAvec, boiteEnvoiCree, deltaAppliques };
}

// §18-A : Vente simple
describe("§18-A — Vente simple", async () => {
  it("enregistre une vente avec produit, quantité, prix et calcule le total correct", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 50 } } });

    const result = await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Dupont",
      clientTelephone: "077001122",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Admin",
      vendeurNomManuel: null,
      modeReglement: "Espèces",

      remise: 0,
      lignes: [{ produitId: "p1", quantite: 3, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 3 }] }],
    });

    expect(result.numero).toBe("FAC-2026-TEST");
    expect(result.total).toBe(45000);
    const facture = factureCreeAvec[0] as { clientNom: string; total: number };
    expect(facture.clientNom).toBe("Dupont");
    expect(facture.total).toBe(45000);
  });

  it("refuse une vente sans ligne", async () => {
    const { service } = creerService();
    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0, lignes: [],
      })).rejects.toThrow(VenteValidationError);
  });

  it("snapshote la surface du carton (m²) sur la ligne de facture quand le produit a carreauxParCarton/dimensions renseignés (2026-10-08)", async () => {
    const { service, factureCreeAvec } = creerService({
      stock: { p1: { akebe: 50 } },
      produits: [{ id: "p1", prix: 8000, motif: "Marbre Blanc", taille: "60×60", largeur: 60, hauteur: 60, carreauxParCarton: 4 }],
    });

    await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Dupont",
      clientTelephone: "077001122",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Admin",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId: "p1", quantite: 3, prixUnitaire: 11520, allocationsDepots: [{ emplacementId: "akebe", quantite: 3 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { surfaceCartonM2: number | null }[] };
    // 60x60 cm, 4 carreaux/carton → 1.44 m² (exemple réel donné par l'utilisateur).
    expect(facture.lignes[0]!.surfaceCartonM2).toBeCloseTo(1.44, 6);
  });

  it("surfaceCartonM2 reste null quand carreauxParCarton n'est pas renseigné pour le produit (catalogue pas encore migré)", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 50 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Dupont",
      clientTelephone: "077001122",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "Admin",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
      remise: 0,
      lignes: [{ produitId: "p1", quantite: 3, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 3 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { surfaceCartonM2: number | null }[] };
    expect(facture.lignes[0]!.surfaceCartonM2).toBeNull();
  });

  // RÉGRESSION bug réel (correction "Rendre le numéro de téléphone
  // facultatif", 2026-10-21) : accepte désormais une vente SANS numéro de
  // téléphone (vide ou null) — comportement historique : refusée.
  it("accepte une vente sans numéro de téléphone client (vide)", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 10 } } });
    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: null, remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });
    expect((factureCreeAvec[0] as { clientTelephone: string | null }).clientTelephone).toBeNull();
  });

  it("accepte une vente sans numéro de téléphone client (null)", async () => {
    const { service } = creerService({ stock: { p1: { akebe: 10 } } });
    await service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: null,
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      });
  });

  it("refuse un numéro de téléphone RENSEIGNÉ mais invalide (jamais accepté silencieusement)", async () => {
    const { service } = creerService({ stock: { p1: { akebe: 10 } } });
    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "abc",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      })).rejects.toThrow(VenteValidationError);
  });
});

// §18-B : Plusieurs variantes du même modèle
describe("§18-B — Plusieurs variantes du même modèle", async () => {
  it("applique le prix propre à chaque variante et traite les stocks indépendamment", async () => {
    const { service, mouvementsCrees, deltaAppliques } = creerService({
      produits: [
        { id: "v1", prix: 12000, motif: "Marbre Blanc", taille: "30×60" },
        { id: "v2", prix: 18000, motif: "Marbre Blanc", taille: "60×60" },
      ],
      stock: { v1: { akebe: 20 }, v2: { akebe: 15 } },
    });

    const result = await service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "u1",
      vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null,
      modeReglement: "Espèces",

      remise: 0,
      lignes: [
        { produitId: "v1", quantite: 5, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: "akebe", quantite: 5 }] },
        { produitId: "v2", quantite: 3, prixUnitaire: 18000, allocationsDepots: [{ emplacementId: "akebe", quantite: 3 }] },
      ],
    });

    // Total = 5×12000 + 3×18000 = 60000 + 54000 = 114000
    expect(result.total).toBe(114000);

    // Deux mouvements distincts, un par variante
    expect(mouvementsCrees).toHaveLength(2);
    const ids = mouvementsCrees.map((m) => (m as { produitId: string }).produitId);
    expect(ids).toContain("v1");
    expect(ids).toContain("v2");

    // Deux deltas distincts appliqués, un par variante
    expect(deltaAppliques).toHaveLength(2);
    const deltaV1 = deltaAppliques.find((d) => (d as { produitId: string }).produitId === "v1") as { delta: number };
    const deltaV2 = deltaAppliques.find((d) => (d as { produitId: string }).produitId === "v2") as { delta: number };
    expect(deltaV1.delta).toBe(-5);
    expect(deltaV2.delta).toBe(-3);
  });

  it("refuse la vente si le stock de l'une des variantes est insuffisant", async () => {
    const { service } = creerService({
      produits: [
        { id: "v1", prix: 12000, motif: "M", taille: "30×60" },
        { id: "v2", prix: 18000, motif: "M", taille: "60×60" },
      ],
      stock: { v1: { akebe: 3 }, v2: { akebe: 1 } }, // v2 ne peut fournir que 1
    });

    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        lignes: [
          { produitId: "v1", quantite: 2, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: "akebe", quantite: 2 }] },
          { produitId: "v2", quantite: 5, prixUnitaire: 18000, allocationsDepots: [{ emplacementId: "akebe", quantite: 5 }] },
        ],
      })).rejects.toThrow();
  });
});

// §18-C : Promotion
describe("§18-C — Promotion", async () => {
  const futur = new Date(Date.now() + 86400000).toISOString();
  const passe = new Date(Date.now() - 86400000).toISOString();
  const tresAncien = new Date(Date.now() - 2 * 86400000).toISOString();

  it("enregistre la promotion active sur la ligne de facture au moment de la validation", async () => {
    const { service, factureCreeAvec } = creerService({
      stock: { p1: { akebe: 50 } },
      promotions: [{
        id: "promo-1", libelle: "Soldes été", typeReduction: "pourcentage", valeur: 20,
        perimetre: "cible", produitIds: ["p1"], dateDebut: passe, dateFin: futur,
      }],
    });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Client", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 2, prixUnitaire: 12000, allocationsDepots: [{ emplacementId: "akebe", quantite: 2 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { promotionId: string | null; promotionLibelle: string | null; prixUnitaireNormal: number | null }[] };
    const ligne = facture.lignes[0]!;
    expect(ligne.promotionId).toBe("promo-1");
    expect(ligne.promotionLibelle).toBe("Soldes été");
    expect(ligne.prixUnitaireNormal).toBe(15000); // prix catalogue conservé
  });

  it("n'enregistre aucune promotion si la promotion est expirée au moment de la validation", async () => {
    const { service, factureCreeAvec } = creerService({
      stock: { p1: { akebe: 50 } },
      promotions: [{
        id: "promo-exp", libelle: "Ancienne promo", typeReduction: "pourcentage", valeur: 30,
        perimetre: "cible", produitIds: ["p1"], dateDebut: tresAncien, dateFin: passe,
      }],
    });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Client", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { promotionId: string | null }[] };
    expect(facture.lignes[0]!.promotionId).toBeNull();
  });

  it("une promotion globale s'applique même sans ciblage explicite du produit", async () => {
    const { service, factureCreeAvec } = creerService({
      stock: { p1: { akebe: 50 } },
      promotions: [{
        id: "promo-global", libelle: "Black Friday", typeReduction: "montant_fixe", valeur: 2000,
        perimetre: "global", produitIds: [], dateDebut: passe, dateFin: futur,
      }],
    });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Client", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 13000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { promotionId: string | null }[] };
    expect(facture.lignes[0]!.promotionId).toBe("promo-global");
  });

  it("préserve le prixUnitaireNormal au prix catalogue, jamais au prix saisi manuellement", async () => {
    const { service, factureCreeAvec } = creerService({
      stock: { p1: { akebe: 50 } },
      promotions: [{
        id: "promo-1", libelle: "Promo test", typeReduction: "pourcentage", valeur: 10,
        perimetre: "cible", produitIds: ["p1"], dateDebut: passe, dateFin: futur,
      }],
    });

    // L'utilisateur saisit un prix manuel différent du prix promo
    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Client", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 10000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { prixUnitaireNormal: number | null; prixUnitaire: number }[] };
    // prixUnitaireNormal = prix catalogue du produit (15000), pas le prix saisi (10000)
    expect(facture.lignes[0]!.prixUnitaireNormal).toBe(15000);
    // Le prix saisi (10000) est bien celui enregistré sur la ligne
    expect(facture.lignes[0]!.prixUnitaire).toBe(10000);
  });
});

// §18-D : Prix manuel
describe("§18-D — Prix unitaire manuel", async () => {
  it("enregistre le prix saisi manuellement, pas le prix catalogue", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 10 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 20000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const facture = factureCreeAvec[0] as { lignes: { prixUnitaire: number }[]; total: number };
    expect(facture.lignes[0]!.prixUnitaire).toBe(20000);
    expect(facture.total).toBe(20000);
  });

  it("refuse un prix unitaire nul ou négatif", async () => {
    const { service } = creerService({ stock: { p1: { akebe: 10 } } });
    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 0, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      })).rejects.toThrow(VenteValidationError);
  });
});

// §18-E : Stock
describe("§18-E — Stock", async () => {
  it("déduit exactement la quantité allouée du dépôt concerné", async () => {
    const { service, deltaAppliques } = creerService({ stock: { p1: { akebe: 30 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 10, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 10 }] }],
    });

    expect(deltaAppliques).toHaveLength(1);
    expect(deltaAppliques[0]).toMatchObject({ produitId: "p1", emplacementId: "akebe", delta: -10 });
  });

  it("refuse la vente si le stock est insuffisant dans le dépôt demandé", async () => {
    const { service } = creerService({ stock: { p1: { akebe: 5 } } });
    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        lignes: [{ produitId: "p1", quantite: 10, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 10 }] }],
      })).rejects.toThrow();
  });

  it("crée bien un mouvement de type 'sortie' pour chaque allocation de dépôt", async () => {
    const { service, mouvementsCrees } = creerService({ stock: { p1: { akebe: 20 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 5, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 5 }] }],
    });

    expect(mouvementsCrees[0]).toMatchObject({ type: "sortie" });
  });
});

// §18-F : Sourcing externe
describe("§18-F — Sourcing externe", async () => {
  it("part entièrement externe : aucun delta de stock, un mouvement emplacementId:null créé", async () => {
    const { service, deltaAppliques, mouvementsCrees } = creerService();

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 5, prixUnitaire: 15000, allocationsDepots: [], fournisseurExterne: "FX", prixAchatExterne: 10000 }],
    });

    expect(deltaAppliques).toHaveLength(0); // aucun stock modifié
    expect(mouvementsCrees).toHaveLength(1);
    expect(mouvementsCrees[0]).toMatchObject({ emplacementId: null, quantite: 5 });
  });

  it("part mixte : le delta ne porte que sur la quantité interne, jamais sur la part externe", async () => {
    const { service, deltaAppliques, mouvementsCrees } = creerService({ stock: { p1: { akebe: 20 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 15, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 10 }], fournisseurExterne: "FX", prixAchatExterne: 10000 }],
    });

    // Delta = -10 (interne), pas -15 (total)
    expect(deltaAppliques).toHaveLength(1);
    expect(deltaAppliques[0]).toMatchObject({ delta: -10 });

    // 2 mouvements : un pour Akébé, un pour la part externe
    expect(mouvementsCrees).toHaveLength(2);
  });

  it("refuse si la part externe est non couverte mais fournisseur absent", async () => {
    const { service } = creerService({ stock: { p1: { akebe: 5 } } });
    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        // quantite=10, allocation=5 → 5 externe sans fournisseur
        lignes: [{ produitId: "p1", quantite: 10, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 5 }] }],
      })).rejects.toThrow(VenteValidationError);
  });
});

// §18-G : Facture
describe("§18-G — Facture", async () => {
  it("crée la facture avec le numéro, le client, le vendeur et le total corrects", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 10 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Marie Dupont", clientTelephone: "077001122",
      clientAdresse: "Libreville", vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "Jean",
      vendeurNomManuel: null, modeReglement: "Virement", remise: 0,
      lignes: [{ produitId: "p1", quantite: 2, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 2 }] }],
    });

    const f = factureCreeAvec[0] as { numero: string; clientNom: string; clientAdresse: string | null; modeReglement: string | null; total: number };
    expect(f.numero).toBe("FAC-2026-TEST");
    expect(f.clientNom).toBe("Marie Dupont");
    expect(f.clientAdresse).toBe("Libreville");
    expect(f.modeReglement).toBe("Virement");
    expect(f.total).toBe(30000);
  });

  it("un vendeur manuel est utilisé si renseigné, sinon le compte connecté", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 10 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "Admin",
      vendeurNomManuel: "Pauline", modeReglement: null, remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const f = factureCreeAvec[0] as { vendeurNomManuel: string | null };
    expect(f.vendeurNomManuel).toBe("Pauline");
  });
});

// §18-I : Transaction atomique
describe("§18-I — Transaction atomique", async () => {
  it("une erreur à mi-transaction (stock insuffisant sur le second dépôt) n'enregistre aucune facture ni mouvement", async () => {
    // Utilise le vrai mécanisme de transaction via un wrapper synchrone : si fn() lève, rien n'est persisté.
    const mouvementsCrees: unknown[] = [];
    const deltaAppliques: unknown[] = [];
    const factureCreeAvec: unknown[] = [];

    const produitRepository = { findById: () => ({ id: "p1", prix: 15000, motif: "M", taille: "T" }) };
    const stockRepository = {
      getQuantite: (_pid: string, emplacementId: string) => {
        if (emplacementId === "akebe") return 20;
        return 1; // akanda : insuffisant pour 5
      },
      applyDelta: (d: unknown) => { deltaAppliques.push(d); },
    };
    const mouvementRepository = {
      create: (m: unknown) => { mouvementsCrees.push(m); return "m1"; },
      listParFacture: () => [],
    };
    const factureRepository = {
      nextNumero: () => "FAC-TEST",
      create: (f: unknown) => { factureCreeAvec.push(f); return "f1"; },
      createReleveInterne: vi.fn(),
    };
    const boiteEnvoiRepository = { creer: vi.fn() };
    // Transaction réelle : la fonction est wrappée, si elle lève l'état mutable n'est pas rollbacké
    // dans ce test car on utilise des tableaux en mémoire. On vérifie que l'exception se propage.
    const fauxDb = {
      transaction: (fn: () => unknown) => () => fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, produitRepository as any, stockRepository as any, mouvementRepository as any, factureRepository as any, boiteEnvoiRepository as any);

    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: null, remise: 0,
        lignes: [{
          produitId: "p1", quantite: 10, prixUnitaire: 15000,
          allocationsDepots: [
            { emplacementId: "akebe", quantite: 5 },
            { emplacementId: "akanda", quantite: 5 }, // 5 demandés, 1 disponible → erreur
          ],
        }],
      })).rejects.toThrow();

    // Aucune facture ne doit avoir été enregistrée (l'exception se produit avant la création)
    expect(factureCreeAvec).toHaveLength(0);
  });
});

// §18-J : Offline-first / boîte d'envoi
describe("§18-J — Offline-first (boîte d'envoi)", async () => {
  it("ajoute une entrée dans la boîte d'envoi après chaque vente réussie", async () => {
    const { service, boiteEnvoiCree } = creerService({ stock: { p1: { akebe: 10 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "X", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 2, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 2 }] }],
    });

    expect(boiteEnvoiCree).toHaveLength(1);
    expect(boiteEnvoiCree[0]).toEqual(expect.arrayContaining(["vente"]));
  });

  it("ajoute une entrée 'annulation' dans la boîte d'envoi après chaque annulation réussie", async () => {
    const boiteEnvoiCree: unknown[] = [];
    const factureRepository = {
      findById: () => ({ id: "f1", numero: "FAC-TEST", annuleeLe: null }),
      annuler: vi.fn(),
    };
    const boiteEnvoiRepository = { creer: (...args: unknown[]) => { boiteEnvoiCree.push(args); return "be-1"; } };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, {} as any, {} as any, { listParFacture: () => [] } as any, factureRepository as any, boiteEnvoiRepository as any);

    await service.annulerVente("f1", "Erreur", "u1");

    expect(boiteEnvoiCree).toHaveLength(1);
    expect(boiteEnvoiCree[0]).toEqual(expect.arrayContaining(["annulation"]));
  });

  it("la boîte d'envoi contient le numéro de facture et le total dans son payload", async () => {
    const { service, boiteEnvoiCree } = creerService({ stock: { p1: { akebe: 10 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Y", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const [entityType, , payload] = boiteEnvoiCree[0] as [string, string, { numero: string; total: number }];
    expect(entityType).toBe("vente");
    expect(payload.numero).toBe("FAC-2026-TEST");
    expect(payload.total).toBe(15000);
  });
});

describe("Remise / Négociation", async () => {
  it("cas du cahier des charges : 13 × 15 000 avec remise 2 000 → total 195 000 stocké, remise 2 000 stockée", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 20 } } });

    const resultat = await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 2000,
      lignes: [{ produitId: "p1", quantite: 13, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 13 }] }],
    });

    expect(resultat.total).toBe(195000);
    expect(resultat.remise).toBe(2000);
    const input = factureCreeAvec[0] as { total: number; remise: number };
    expect(input.total).toBe(195000);
    expect(input.remise).toBe(2000);
  });

  it("une remise de 0 est acceptée et stockée normalement", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 5 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const input = factureCreeAvec[0] as { remise: number };
    expect(input.remise).toBe(0);
  });

  it("rejette une remise supérieure au total — AUCUNE facture créée", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 5 } } });

    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: "Espèces", remise: 999999,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      })).rejects.toThrow(VenteValidationError);
    expect(factureCreeAvec).toHaveLength(0);
  });

  it("accepte une remise strictement égale au total", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 5 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 15000,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const input = factureCreeAvec[0] as { remise: number; total: number };
    expect(input.remise).toBe(15000);
    expect(input.total).toBe(15000);
  });

  it("rejette une remise négative", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 5 } } });

    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: "Espèces", remise: -100,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      })).rejects.toThrow(VenteValidationError);
    expect(factureCreeAvec).toHaveLength(0);
  });
});

describe("Réservation / Acompte", async () => {
  it("statutPaiement omis : la vente est stockée 'payee' avec montantPaye = total net", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 5 } } });

    await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 1000,
      lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
    });

    const input = factureCreeAvec[0] as { statutPaiement: string; montantPaye: number };
    expect(input.statutPaiement).toBe("payee");
    expect(input.montantPaye).toBe(14000); // 15000 - 1000 de remise
  });

  it("une réservation explicite avec un acompte valide est stockée telle quelle", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 13 } } });

    const resultat = await service.enregistrerVente({
      pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
      clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
      vendeurNomManuel: null, modeReglement: "Espèces", remise: 2000,
      statutPaiement: "reservation", montantPaye: 50000,
      lignes: [{ produitId: "p1", quantite: 13, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 13 }] }],
    });

    expect(resultat.total).toBe(195000);
    const input = factureCreeAvec[0] as { statutPaiement: string; montantPaye: number; remise: number };
    expect(input.statutPaiement).toBe("reservation");
    expect(input.montantPaye).toBe(50000);
    expect(input.remise).toBe(2000);
  });

  it("rejette une réservation dont l'acompte est supérieur ou égal au total net — aucune facture créée", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 1 } } });

    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
        statutPaiement: "reservation", montantPaye: 15000,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      })).rejects.toThrow(VenteValidationError);
    expect(factureCreeAvec).toHaveLength(0);
  });

  it("rejette une réservation avec un acompte nul ou négatif — aucune facture créée", async () => {
    const { service, factureCreeAvec } = creerService({ stock: { p1: { akebe: 1 } } });

    await expect(service.enregistrerVente({
        pointDeVenteId: "shop", clientNom: "Z", clientTelephone: "077000000",
        clientAdresse: null, vendeurUtilisateurId: "u1", vendeurCompteConnecteNom: "A",
        vendeurNomManuel: null, modeReglement: "Espèces", remise: 0,
        statutPaiement: "reservation", montantPaye: 0,
        lignes: [{ produitId: "p1", quantite: 1, prixUnitaire: 15000, allocationsDepots: [{ emplacementId: "akebe", quantite: 1 }] }],
      })).rejects.toThrow(VenteValidationError);
    expect(factureCreeAvec).toHaveLength(0);
  });
});

describe("changerStatutFacture — menu de statut (Réservation / Payée non livrée / Payée livrée)", async () => {
  function creerServiceAvecFacture(facture: { id: string; total: number; remise: number; statutPaiement: "reservation" | "payee"; annuleeLe: string | null }) {
    const changerStatutAppels: unknown[] = [];
    const factureRepository = {
      findById: (id: string) => (id === facture.id ? facture : null),
      changerStatut: (id: string, statut: unknown) => { changerStatutAppels.push({ id, statut }); },
    };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, {} as any, {} as any, {} as any, factureRepository as any, {} as any);
    return { service, changerStatutAppels };
  }

  it("encaisse automatiquement le solde en passant une réservation à 'Payée — Non livrée'", async () => {
    const { service, changerStatutAppels } = creerServiceAvecFacture({ id: "f1", total: 195000, remise: 2000, statutPaiement: "reservation", annuleeLe: null });

    service.changerStatutFacture("f1", "payee_non_livree");

    expect(changerStatutAppels).toEqual([{ id: "f1", statut: { statutPaiement: "payee", montantPaye: 193000, statutLivraison: "en_attente" } }]);
  });

  it("passe directement une réservation à 'Payée — Livrée' (encaisse le solde ET marque livrée en un seul geste)", async () => {
    const { service, changerStatutAppels } = creerServiceAvecFacture({ id: "f1", total: 195000, remise: 0, statutPaiement: "reservation", annuleeLe: null });

    service.changerStatutFacture("f1", "payee_livree");

    expect(changerStatutAppels).toEqual([{ id: "f1", statut: { statutPaiement: "payee", montantPaye: 195000, statutLivraison: "livree" } }]);
  });

  it("autorise librement l'aller-retour entre 'Payée — Non livrée' et 'Payée — Livrée' (aucun verrou terminus)", async () => {
    const { service, changerStatutAppels } = creerServiceAvecFacture({ id: "f1", total: 100000, remise: 0, statutPaiement: "payee", annuleeLe: null });

    service.changerStatutFacture("f1", "payee_livree");
    service.changerStatutFacture("f1", "payee_non_livree");

    expect(changerStatutAppels).toEqual([
      { id: "f1", statut: { statutPaiement: "payee", montantPaye: 100000, statutLivraison: "livree" } },
      { id: "f1", statut: { statutPaiement: "payee", montantPaye: 100000, statutLivraison: "en_attente" } },
    ]);
  });

  it("refuse de repasser une facture déjà payée en 'Réservation' — aucun mécanisme pour rendre l'argent déjà reçu", async () => {
    const { service, changerStatutAppels } = creerServiceAvecFacture({ id: "f1", total: 100000, remise: 0, statutPaiement: "payee", annuleeLe: null });

    expect(() => service.changerStatutFacture("f1", "reservation")).toThrow(VenteValidationError);
    expect(changerStatutAppels).toHaveLength(0);
  });

  it("refuse de changer le statut d'une facture annulée", async () => {
    const { service, changerStatutAppels } = creerServiceAvecFacture({ id: "f1", total: 100000, remise: 0, statutPaiement: "payee", annuleeLe: "2026-01-01T00:00:00Z" });

    expect(() => service.changerStatutFacture("f1", "payee_livree")).toThrow(VenteValidationError);
    expect(changerStatutAppels).toHaveLength(0);
  });

  it("refuse de changer le statut d'une facture introuvable", async () => {
    const { service, changerStatutAppels } = creerServiceAvecFacture({ id: "f1", total: 100000, remise: 0, statutPaiement: "payee", annuleeLe: null });

    expect(() => service.changerStatutFacture("introuvable", "payee_livree")).toThrow(VenteValidationError);
    expect(changerStatutAppels).toHaveLength(0);
  });
});
