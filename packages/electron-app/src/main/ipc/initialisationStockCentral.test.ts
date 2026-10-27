import { describe, it, expect, vi } from "vitest";
import { executerInitialisationStockCentral } from "./initialisationStockCentral.js";

/**
 * Tests ciblés de l'amorçage ponctuel du stock partagé — correction "pc
 * annexe ne peut pas vendre malgré le stock réel" (2026-10-27). Logique
 * pure, testée sans `electron` (voir metier.catalogSync.test.ts pour la
 * convention de ce projet).
 */

function makeStockRepository(lignes: { produitId: string; emplacementId: string; quantite: number }[] = []) {
  return { listTout: vi.fn(() => lignes) };
}

function makeValidationStockDistanteService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    estConfiguree: vi.fn(() => true),
    initialiserStockCentral: vi.fn(async () => ({ success: true as const, lignesAppliquees: 2 })),
    ...overrides,
  };
}

describe("executerInitialisationStockCentral", () => {
  it("rejette un appelant sans session", async () => {
    const repo = makeStockRepository();
    const service = makeValidationStockDistanteService();
    const resultat = await executerInitialisationStockCentral(repo, service, null);
    expect(resultat).toEqual({ success: false, message: "Seul l'Administrateur peut effectuer cette action." });
    expect(service.initialiserStockCentral).not.toHaveBeenCalled();
  });

  it("rejette un Gérant — réservé à l'Administrateur", async () => {
    const repo = makeStockRepository();
    const service = makeValidationStockDistanteService();
    const resultat = await executerInitialisationStockCentral(repo, service, { role: "gerant" });
    expect(resultat).toEqual({ success: false, message: "Seul l'Administrateur peut effectuer cette action." });
    expect(service.initialiserStockCentral).not.toHaveBeenCalled();
  });

  it("rejette si la synchronisation n'est pas configurée sur ce poste", async () => {
    const repo = makeStockRepository([{ produitId: "p1", emplacementId: "e1", quantite: 5 }]);
    const service = makeValidationStockDistanteService({ estConfiguree: vi.fn(() => false) });
    const resultat = await executerInitialisationStockCentral(repo, service, { role: "administrateur" });
    expect(resultat).toEqual({ success: false, message: "Synchronisation non configurée sur ce poste." });
    expect(service.initialiserStockCentral).not.toHaveBeenCalled();
  });

  it("rejette si ce poste n'a localement aucune ligne de stock", async () => {
    const repo = makeStockRepository([]);
    const service = makeValidationStockDistanteService();
    const resultat = await executerInitialisationStockCentral(repo, service, { role: "administrateur" });
    expect(resultat).toEqual({ success: false, message: "Aucune ligne de stock trouvée sur ce poste." });
    expect(service.initialiserStockCentral).not.toHaveBeenCalled();
  });

  it("Administrateur, synchro configurée, stock présent : transmet EXACTEMENT les lignes locales au service", async () => {
    const lignes = [
      { produitId: "p1", emplacementId: "akebe", quantite: 29 },
      { produitId: "p2", emplacementId: "akanda", quantite: 4 },
    ];
    const repo = makeStockRepository(lignes);
    const service = makeValidationStockDistanteService();

    const resultat = await executerInitialisationStockCentral(repo, service, { role: "administrateur" });

    expect(service.initialiserStockCentral).toHaveBeenCalledWith(lignes);
    expect(resultat).toEqual({ success: true, lignesAppliquees: 2 });
  });

  it("propage un échec réseau/serveur du service distant tel quel", async () => {
    const repo = makeStockRepository([{ produitId: "p1", emplacementId: "e1", quantite: 5 }]);
    const service = makeValidationStockDistanteService({
      initialiserStockCentral: vi.fn(async () => ({ success: false as const, message: "Le serveur a refusé la demande (HTTP 500)." })),
    });

    const resultat = await executerInitialisationStockCentral(repo, service, { role: "administrateur" });

    expect(resultat).toEqual({ success: false, message: "Le serveur a refusé la demande (HTTP 500)." });
  });
});
