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
