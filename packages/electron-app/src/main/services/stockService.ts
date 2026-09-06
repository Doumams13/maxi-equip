import { stock as domainStock } from "@maxi-equip/domain";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";

/**
 * Orchestration des opérations de stock — la RÈGLE elle-même (delta,
 * vérification de disponibilité) vient exclusivement de packages/domain
 * (§19 du prompt Phase 2). Ce service ne fait qu'assembler : domaine →
 * dépôt de données → historique.
 */
export class StockService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly mouvementRepository: MouvementRepository
  ) {}

  enregistrerEntree(produitId: string, emplacementId: string, quantite: number, utilisateurId: string): void {
    const delta = domainStock.applyEntree(emplacementId, quantite); // lève une erreur domaine si quantité invalide
    this.stockRepository.applyDelta({ ...delta, produitId });
    this.mouvementRepository.create({
      type: "entree",
      produitId,
      emplacementId,
      emplacementSourceId: null,
      emplacementDestinationId: null,
      quantite,
      date: new Date().toISOString(),
      factureId: null,
      utilisateurId,
      note: null,
    });
  }

  enregistrerTransfert(produitId: string, sourceId: string, destinationId: string, quantite: number, utilisateurId: string): void {
    const disponible = this.stockRepository.getQuantite(produitId, sourceId);
    const [deltaSource, deltaDestination] = domainStock.applyTransfert(sourceId, destinationId, disponible, quantite);
    this.stockRepository.applyDelta({ ...deltaSource, produitId });
    this.stockRepository.applyDelta({ ...deltaDestination, produitId });
    this.mouvementRepository.create({
      type: "transfert",
      produitId,
      emplacementId: null,
      emplacementSourceId: sourceId,
      emplacementDestinationId: destinationId,
      quantite,
      date: new Date().toISOString(),
      factureId: null,
      utilisateurId,
      note: null,
    });
  }
}
