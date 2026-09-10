import { stock as domainStock } from "@maxi-equip/domain";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";

/**
 * Orchestration des opérations de stock — la RÈGLE elle-même (delta,
 * vérification de disponibilité) vient exclusivement de packages/domain
 * (§19 du prompt Phase 2). Ce service ne fait qu'assembler : domaine →
 * dépôt de données → historique.
 *
 * Phase 3.3 : chaque opération est désormais enveloppée dans une
 * transaction explicite (`db.transaction`) — elle n'existait pas avant
 * cette correction (chaque appel de dépôt s'exécutait comme sa propre
 * instruction auto-validée). Ce n'est pas un changement de comportement
 * métier : simplement la garantie que l'écriture du mouvement/stock ET
 * l'ajout dans la boîte d'envoi réussissent ou échouent ensemble,
 * jamais l'un sans l'autre (§6 de la correction).
 */
export class StockService {
  constructor(
    private readonly db: import("better-sqlite3-multiple-ciphers").Database,
    private readonly stockRepository: StockRepository,
    private readonly mouvementRepository: MouvementRepository,
    private readonly boiteEnvoiRepository: BoiteEnvoiRepository
  ) {}

  enregistrerEntree(produitId: string, emplacementId: string, quantite: number, utilisateurId: string): void {
    const executer = this.db.transaction(() => {
      const delta = domainStock.applyEntree(emplacementId, quantite); // lève une erreur domaine si quantité invalide
      this.stockRepository.applyDelta({ ...delta, produitId });
      const date = new Date().toISOString();
      const mouvementId = this.mouvementRepository.create({
        type: "entree",
        produitId,
        emplacementId,
        emplacementSourceId: null,
        emplacementDestinationId: null,
        quantite,
        date,
        factureId: null,
        utilisateurId,
        note: null,
      });
      this.boiteEnvoiRepository.creer("entree", mouvementId, { mouvementId, produitId, emplacementId, quantite, date, utilisateurId });
    });
    executer();
  }

  enregistrerTransfert(produitId: string, sourceId: string, destinationId: string, quantite: number, utilisateurId: string): void {
    const executer = this.db.transaction(() => {
      const disponible = this.stockRepository.getQuantite(produitId, sourceId);
      const [deltaSource, deltaDestination] = domainStock.applyTransfert(sourceId, destinationId, disponible, quantite);
      this.stockRepository.applyDelta({ ...deltaSource, produitId });
      this.stockRepository.applyDelta({ ...deltaDestination, produitId });
      const date = new Date().toISOString();
      const mouvementId = this.mouvementRepository.create({
        type: "transfert",
        produitId,
        emplacementId: null,
        emplacementSourceId: sourceId,
        emplacementDestinationId: destinationId,
        quantite,
        date,
        factureId: null,
        utilisateurId,
        note: null,
      });
      this.boiteEnvoiRepository.creer("transfert", mouvementId, {
        mouvementId,
        produitId,
        emplacementSourceId: sourceId,
        emplacementDestinationId: destinationId,
        quantite,
        date,
        utilisateurId,
      });
    });
    executer();
  }
}
