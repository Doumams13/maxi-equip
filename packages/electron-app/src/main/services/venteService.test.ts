import { describe, expect, it, vi } from "vitest";
import { VenteService } from "./venteService.js";

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
  const fauxDb = {
    transaction: (fn: () => unknown) => () => fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new VenteService(fauxDb as any, produitRepository as any, stockRepository as any, mouvementRepository as any, factureRepository as any);
  return { service, mouvementsCrees, applyDelta: stockRepository.applyDelta };
}

describe("VenteService — correctif : traçabilité d'une vente entièrement externe", () => {
  it("crée un mouvement de sortie même quand AUCUN dépôt n'est utilisé (0% interne, 100% externe)", () => {
    const { service, mouvementsCrees, applyDelta } = creerServiceAvecFauxDepots();

    const resultat = service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client Test",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "user-admin",
      vendeurCompteConnecteNom: "Administrateur",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
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

  it("crée un mouvement par dépôt ET un mouvement pour la part externe lorsque la vente est mixte", () => {
    const { service, mouvementsCrees } = creerServiceAvecFauxDepots();

    service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client Test",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "user-gerant",
      vendeurCompteConnecteNom: "Gérant",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
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

  it("ne crée toujours qu'un seul mouvement quand la vente est entièrement interne (pas de régression)", () => {
    const { service, mouvementsCrees } = creerServiceAvecFauxDepots();

    service.enregistrerVente({
      pointDeVenteId: "shop",
      clientNom: "Client Test",
      clientTelephone: "077000000",
      clientAdresse: null,
      vendeurUtilisateurId: "user-gerant",
      vendeurCompteConnecteNom: "Gérant",
      vendeurNomManuel: null,
      modeReglement: "Espèces",
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

describe("VenteService — annulation d'une facture (restauration du stock)", () => {
  it("restaure le stock UNIQUEMENT pour la part prélevée sur un dépôt, jamais pour la part externe", () => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, produitRepository as any, stockRepository as any, mouvementRepository as any, factureRepository as any);

    service.annulerVente("f1", "Erreur de saisie du client", "user-admin");

    // Un seul mouvement de restauration créé — celui d'Akébé, jamais pour la part externe.
    expect(mouvementsCrees).toHaveLength(1);
    expect(mouvementsCrees[0]).toMatchObject({ type: "entree", emplacementId: "akebe", quantite: 10, utilisateurId: "user-admin" });
    expect(applyDelta).toHaveBeenCalledTimes(1);
    expect(factureRepository.annuler).toHaveBeenCalledWith("f1", "Erreur de saisie du client", "user-admin");
  });

  it("refuse d'annuler sans motif", () => {
    const factureRepository = { findById: () => ({ id: "f1", annuleeLe: null }), annuler: vi.fn() };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, {} as any, {} as any, { listParFacture: () => [] } as any, factureRepository as any);
    expect(() => service.annulerVente("f1", "", "user-admin")).toThrow();
  });

  it("refuse d'annuler une facture déjà annulée", () => {
    const factureRepository = { findById: () => ({ id: "f1", annuleeLe: "2026-01-01T00:00:00Z" }), annuler: vi.fn() };
    const fauxDb = { transaction: (fn: () => unknown) => () => fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new VenteService(fauxDb as any, {} as any, {} as any, { listParFacture: () => [] } as any, factureRepository as any);
    expect(() => service.annulerVente("f1", "Motif", "user-admin")).toThrow();
  });
});
